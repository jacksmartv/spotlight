/**
 * Spotlight kind definition
 * @author: Lex Podgorny
 */

enyo.kind({
	name: 'enyo.Spotlight',
	published: {
		defaultControl	: null,
		useVisuals		: true
	},
	/************************************************************/
	
	rendered: function() {
		this.inherited(arguments);
		enyo.Spotlight.initialize(this.owner, this.defaultControl);
	},

	destroy: function() {
		enyo.Spotlight.deregister(this.owner);
		this.inherited(arguments);
	},
	
	/************************************************************/
	
	statics: {
		_bPointerMode		: false,
		_oCurrent			: null,		// Currently spotlighted element
		_oOwner				: null,		// Component owner, usually application
		_oDecorators		: {},		// For further optimization
		_oLastEvent			: null,
		_oLast5WayEvent		: null,
		_nLastKey			: null,
		
		_error: function(s) {
			throw 'enyo.Spotlight: ' + s;
		},
		
		_setCurrent: function(oControl) {
			// Create control-specific spotlight state storage
			if (typeof oControl._spotlight == 'undefined') {
				oControl._spotlight = {};
			}
			this._oCurrent = oControl;
			this._dispatchEvent('onSpotlightFocused');
			return true;
		},
		
		// Artificially trigger events on current control, like click
		_dispatchEvent: function(sEvent, oData, oControl) {
			oControl = oControl || this.getCurrent();
			enyo.Spotlight.Util.dispatchEvent(sEvent, oData, oControl);
		},
		
		_interceptEvents: function() {
			var oThis = this;

			// Event hook to the owner to catch Spotlight Events
			this.ownerDispatchFn = this._oOwner.dispatchEvent;
			this._oOwner.dispatchEvent = function(sEventName, oEvent, oSender) {
				oThis.ownerDispatchFn.apply(oThis._oOwner, [sEventName, oEvent, oSender]);
				oThis.onSpotlightEvent(oEvent);
			};			
		},
		
		_getDecorator: function(oSender) {
			if (typeof this._oDecorators[oSender.kind] != 'undefined') {
				return this._oDecorators[oSender.kind];
			}
			
			var oDecorator = null,
				o;
				
			if (oSender.spotlight == 'container') {							// Process containers
				oDecorator = enyo.Spotlight.Decorator['Container'];
			} else {														// Process non-containers
				for (var s in enyo.Spotlight.Decorator) {						// Loop through decorators namespace
					o = enyo.Spotlight.Decorator[s];
					if (o.decorates && oSender instanceof o.decorates) {			// If decorator applies to oSender
						if (!oDecorator) {												// If decorator was NOT set in previous iteration
							oDecorator = o;													// Set it to the first value
						} else {														// If decorator WAS set in previous iteration
							if (o.decorates.prototype instanceof oDecorator.decorates) {	// IF o.decorates is closer to oSender in lineage
								oDecorator = o;													// Set it as optimal decorator
							}
						}
					}
				}
			}
			
			this._oDecorators[oSender.kind] = oDecorator;					// Hash decorator by sender kind
			return oDecorator;
		},
		
		// If decorator present, delegate event to it's corresponding method
		// Return values: if found method to delegate, return it's return value otherwise return true
		_delegateSpotlightEvent: function(oEvent) {
			if (!oEvent.type || oEvent.type.indexOf('onSpotlight') != 0) { return true; }
			
			var s,
				oSender 	= oEvent.originator
				oDecorator 	= this._getDecorator(oSender);
							
			if (oDecorator && typeof oDecorator[oEvent.type] == 'function') {
				return oDecorator[oEvent.type](oSender, oEvent);
			}
			
			return true;
		},

		_isInHalfPlane: function(sDirection, oBounds1, oBounds2) {
			switch (sDirection) {
				case 'UP':
					return oBounds1.top > oBounds2.top;
				case 'DOWN':
					return oBounds1.top < oBounds2.top;
				case 'LEFT':
					return oBounds1.left > oBounds2.left;
				case 'RIGHT':
					return oBounds1.left < oBounds2.left;
					
			}
		},
		
		_getAdjacentControlPrecedence: function(sDirection, oBounds1, oBounds2) {
			var nXCenter1 = oBounds1.left + oBounds1.width,// / 2,
				nXCenter2 = oBounds2.left + oBounds2.width,// / 2,
				nDx = Math.abs(nXCenter2 - nXCenter1) || 0.001,
				nDy = Math.abs(oBounds2.top - oBounds1.top),
				nSlope,
				nAngle,
				nDistance;
			
			switch (sDirection) {
				case 'UP'	:
				case 'DOWN'	:
					nSlope = nDx/nDy;
					break;
				case 'LEFT'	:
				case 'RIGHT':
					nSlope = nDy/nDx;
					break;
			}
			
			nAngle 		= Math.atan(nSlope) * 180/Math.PI 	|| 0.1;
			nDistance	= Math.pow(nDx*nDx + nDy*nDy, 0.5)  || 0.1;
			
			if (nAngle > 89) { return 0 };
			return 1/(nAngle * Math.pow(nDistance, 4));
		},
		
		_getAdjacentControl: function(sDirection, oControl) {
			sDirection = sDirection.toUpperCase();
			oControl = oControl || this.getCurrent();
			
			var n,
				oBestMatch	= null,
				nBestMatch	= 0,
				oBounds1 	= enyo.Spotlight.Util.getAbsoluteBounds(oControl),
				oBounds2	= null,
				o 			= this.getSiblings(oControl),
				nLen 		= o.siblings.length,
				nPrecedence;
				
			for (n=0; n<nLen; n++) {
				oBounds2 = enyo.Spotlight.Util.getAbsoluteBounds(o.siblings[n]);
				if (this._isInHalfPlane(sDirection, oBounds1, oBounds2) && o.siblings[n] !== oControl) {
					nPrecedence = this._getAdjacentControlPrecedence(sDirection, oBounds1, oBounds2);
					if (nPrecedence > nBestMatch) {
						nBestMatch = nPrecedence;
						oBestMatch = o.siblings[n];
					}
				}
			}
			return oBestMatch;
		},
		
		_getTarget: function(sId) {
			var oTarget = enyo.Spotlight.Util.getControlById(sId);
			if (typeof oTarget != 'undefined') {
				if (this.isSpottable(oTarget)) {
					return oTarget;
				} else {
					return this.getParent(oTarget);
				}
			}
		},
		
		/********************* PUBLIC *********************/
		
		initialize: function(oOwner, sDefaultControl) {
			if (this._oOwner) {
				enyo.warn("enyo.Spotlight initialized before previous owner deregistered");
				this.deregister(this._oOwner);
			}
			this._oCurrent = null;
			this._oOwner   = oOwner;
			
			this._interceptEvents();
			
			if (sDefaultControl && typeof this._oOwner.$[sDefaultControl] != 'undefined') {
				this.spot(this._oOwner.$[sDefaultControl]);
			} else {
				this.spot(this._oOwner);
			}
		},

		deregister: function(oOwner) {
			oOwner.dispatchEvent = this.ownerDispatchFn;
			this._oOwner = null;
		},

		// Events dispatched to the spotlighted controls
		onEvent: function(oEvent) {
			var oTarget = null;
			
			// Events only processed when Spotlight initialized with an owner
			if (this._oOwner) {
				switch (oEvent.type) {
					case 'mousemove':
						this.setPointerMode(true);
						if (this.getPointerMode()) {
							oTarget = this._getTarget(oEvent.target.id);
							if (oTarget) {
								this._dispatchEvent('onSpotlightPoint', oEvent, oTarget);
							}
						}
						break;
					case 'keydown':
					case 'keyup':
						enyo.Spotlight.Accelerator.processKey(oEvent);
						break;
				}
			}
		},
		
		// Called from enyo.Spotlight.Accelerator which handles accelerated keyboard event
		onKeyEvent: function(oEvent) {
			this.setPointerMode(false);
			if (!this.getPointerMode()) {
				switch (oEvent.keyCode) {
					case 13:
					case 53: // TODO - hack to support old system
						this._dispatchEvent('onSpotlightSelect', oEvent);
						break;
					case 37:
					case 52: // TODO - hack to support old system
						this._dispatchEvent('onSpotlightLeft', oEvent);
						break;
					case 38:
					case 50: // TODO - hack to support old system
						this._dispatchEvent('onSpotlightUp', oEvent);
						break;
					case 39:
					case 54: // TODO - hack to support old system
						this._dispatchEvent('onSpotlightRight', oEvent);
						break;
					case 40:
					case 56: // TODO - hack to support old system
						this._dispatchEvent('onSpotlightDown', oEvent);
						break;
					default:
						break;
				}
			}
		},
		
		// Spotlight events bubbled back up to the App
		onSpotlightEvent: function(oEvent) {
			
			this._oLastEvent = oEvent;
			
			// If decorator onSpotlight<Event> function return false - preventDefault)
			if (!this._delegateSpotlightEvent(oEvent)) { return; }	

			switch (oEvent.type) {
				case 'onSpotlightFocus':
					this.onFocus(oEvent);
					break;
				case 'onSpotlightFocused':
					this.onFocused(oEvent);
					break;
				case 'onSpotlightBlur':
					this.onBlur(oEvent);
					break;
				case 'onSpotlightLeft':
					this._oLast5WayEvent = oEvent;
					this.onLeft(oEvent);
					break;
				case 'onSpotlightRight':
					this._oLast5WayEvent = oEvent;
					this.onRight(oEvent);
					break;
				case 'onSpotlightUp':
					this._oLast5WayEvent = oEvent;
					this.onUp(oEvent);
					break;
				case 'onSpotlightDown':
					this._oLast5WayEvent = oEvent;
					this.onDown(oEvent);
					break;
				case 'onSpotlightSelect':
					this.onSelect(oEvent);
					break;
				case 'onSpotlightPoint':
					this.onPoint(oEvent);
					break;
			}
		},
		
		/************************************************************/
		
		onMoveTo: function(sDirection) {
			var oControlLeft = this._getAdjacentControl(sDirection);
			if (oControlLeft) {
				this.spot(oControlLeft, sDirection);
			} else {
				this.spot(this.getParent(), sDirection);
			}
		},
		
		onRight	: function() { this.onMoveTo('RIGHT');	},
		onLeft	: function() { this.onMoveTo('LEFT');	},
		onDown	: function() { this.onMoveTo('DOWN');	},
		onUp	: function() { this.onMoveTo('UP');		},
		
		onSelect: function(oEvent) {
			var aChildren = this.getChildren(oEvent.originator);
			if (aChildren.length == 0) {
				this._dispatchEvent('ontap', null, oEvent.originator);
			} else {
				this.spot(aChildren[0]);
			}
		},
		
		onFocus: function(oEvent) {
			this._setCurrent(oEvent.originator);
		},
		
		onFocused: function(oEvent) {
		},
		
		onBlur: function(oEvent) {
			if (this._oCurrent) {
				oEvent.originator.removeClass('spotlight');
			}
		},
		
		onPoint: function(oEvent) {
			if (oEvent.originator.spotlight != 'container') {
				this.spot(oEvent.originator);
			}
		},
		
		/************************************************************/
		
		setPointerMode		: function(bPointerMode)	{ this._bPointerMode = bPointerMode; 	},
		getPointerMode		: function() 				{ return this._bPointerMode; 			},
		getCurrent			: function() 				{ return this._oCurrent; 				},
		setCurrent			: function(oControl)		{ return this._setCurrent(oControl); 	},
		getLastEvent	 	: function() 				{ return this._oLastEvent; 	 			},
		getLast5WayEvent 	: function() 				{ return this._oLast5WayEvent;  		},
		
		isSpottable: function(oControl) {
			oControl = oControl || this.getCurrent();
			return (typeof oControl.spotlight != 'undefined' && oControl.spotlight);
		},
		
		// Returns spottable chldren along with position of self 
		getSiblings: function(oControl) {
			oControl = oControl || this.getCurrent();

			var n,
				o = {};
				oParent = this.getParent(oControl) || oControl.parent;
				o.siblings = this.getChildren(oParent);
				
			for (n=0; n<o.siblings.length; n++) {
				if (oControl === o.siblings[n]) {
					o.selfPosition = n;
				}
			}
			
			return o;
		},
		
		// Returns all spottable children
		getChildren: function(oControl) {
			oControl = oControl || this.getCurrent();
			var n,
				aChildren = [],
				oNext;

			for (n=0; n<oControl.children.length; n++) {
				oNext = oControl.children[n];
				if (this.isSpottable(oNext)) {
					aChildren.push(oNext);
				} else {
					aChildren = aChildren.concat(this.getChildren(oNext));
				}
			}
			return aChildren;
		},
		
		// Returns closest spottable parent
		getParent: function(oControl) {
			oControl = oControl || this.getCurrent();
			var oSpottableParent = null;
			while (oControl.parent) {
				oControl = oControl.parent;
				if (this.isSpottable(oControl)) {
					oSpottableParent = oControl;
					break;
				}
			}
			oSpottableParent = oSpottableParent || oControl;
			return oSpottableParent;
		},
		
		// Dispatches focus event to the control or it's first spottable child
		spot: function(oControl, sDirection) {
			if (this._oCurrent && oControl !== this._oCurrent) {
				this._dispatchEvent('onSpotlightBlur', null, this._oCurrent);
			}
			oControl = oControl || this.getCurrent();
			if (!this.isSpottable(oControl)) {
				oControl = this.getFirstChild(oControl);
			}
			
			if (oControl) {
				oControl.addClass('spotlight');
				this._dispatchEvent('onSpotlightFocus', {dir: sDirection}, oControl, sDirection);
				return true;
			}
			
			return false;
		},
		
		getFirstChild: function(oControl) {
			oControl = oControl || this.getCurrent();
			return this.getChildren(oControl)[0];
		}
	}
});

// Event hook to all system events to catch KEYPRESS
enyo.dispatcher.features.push(function(oEvent) {
	enyo.Spotlight.onEvent(oEvent);
});
