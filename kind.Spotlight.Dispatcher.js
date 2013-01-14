/**
 * enyo.Spotlight.Dispatcher kind definition
 * @author: Lex Podgorny
 */

enyo.kind({
	name: 'enyo.Spotlight.Dispatcher',
	
	statics: {
		_oEvent		: null,
		_nHz		: 1,
		_bContinue	: false,
		_nTimeStart : 0,
		
		_continue: function() {
			if (this._bContinue) {
				setTimeout('enyo.Spotlight.Dispatcher._continue()', 1000/this._nHz);
				var nTimeElapsed = (new Date()).getTime() - this._nTimeStart;
				if (nTimeElapsed >= 3000 && this._nHz == 1) { this._nHz = 2;}
				if (nTimeElapsed >= 6000 && this._nHz == 2) { this._nHz = 3;}
				if (nTimeElapsed >= 9000 && this._nHz == 3) { this._nHz = 4;}
				enyo.Spotlight.onKeyEvent(this._oEvent);
			}
		},
		
		processKey: function(oEvent) {
			switch (oEvent.type) {
				case 'keydown':
					if (!this._oEvent || oEvent.keyCode != this._oEvent.keyCode) {
						this._oEvent = oEvent;
						this.start();
					}
					break;
				case 'keyup':
					this.stop();
					break;
			}
		},
		
		start: function() {
			this._nTimeStart = (new Date()).getTime();
			this._bContinue = true;
			this._continue();
		},
		
		stop: function() {
			this._bContinue = false;
			this._nTimeStart = 0;
			this._oEvent = null;
			this._nHz = 1;
		},
	}
});