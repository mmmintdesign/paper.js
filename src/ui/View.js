/*
 * Paper.js
 *
 * This file is part of Paper.js, a JavaScript Vector Graphics Library,
 * based on Scriptographer.org and designed to be largely API compatible.
 * http://paperjs.org/
 * http://scriptographer.org/
 *
 * Copyright (c) 2011, Juerg Lehni & Jonathan Puckey
 * http://lehni.org/ & http://jonathanpuckey.com/
 *
 * Distributed under the MIT license. See LICENSE file for details.
 *
 * All rights reserved.
 */

/**
 * @name View
 *
 * @class The View object wraps a canvas element and handles drawing and user
 * interaction through mouse and keyboard for it. It offer means to scroll the
 * view, find the currently visible bounds in project coordinates, or the
 * center, both useful for constructing artwork that should appear centered on
 * screen.
 */
var View = this.View = Base.extend(Callback, /** @lends View# */{
	_events: {
		onFrame: {
			install: function() {
/*#*/ if (options.browser) {
				var that = this,
					requested = false,
					before,
					time = 0,
					count = 0;
				this._onFrameCallback = function(param, dontRequest) {
					requested = false;
					// See if we need to stop due to a call to uninstall()
					if (!that._onFrameCallback)
						return;
					// Set the global paper object to the current scope
					paper = that._scope;
					if (!dontRequest) {
						// Request next frame already
						requested = true;
						DomEvent.requestAnimationFrame(that._onFrameCallback,
								that._canvas);
					}
					var now = Date.now() / 1000,
					 	delta = before ? now - before : 0;
					// delta: Time elapsed since last redraw in seconds
					// time: Time since first call of frame() in seconds
					// Use Base.merge to convert into a Base object,
					// for #toString()
					that.fire('frame', Base.merge({
						delta: delta,
						time: time += delta,
						count: count++
					}));
					before = now;
					// Automatically draw view on each frame.
					that.draw(true);
				};
				// Call the onFrame handler straight away, initializing the
				// sequence of onFrame calls.
				if (!requested)
					this._onFrameCallback();
/*#*/ } // options.browser
			},

			uninstall: function() {
				delete this._onFrameCallback;
			}
		},

		onResize: {}
	},

	/**
	 * Creates a view object for a given project.
	 * 
	 * @param {HTMLCanvasElement} canvas The canvas object that this view should
	 * wrap
	 */
	initialize: function(canvas) {
		// Store reference to the currently active global paper scope, and the
		// active project, which will be represented by this view
		this._scope = paper;
		this._project = paper.project;
		// Handle canvas argument
		var size;
/*#*/ if (options.server) {
		if (canvas && canvas instanceof Canvas) {
			this._canvas = canvas;
			size = Size.create(canvas.width, canvas.height);
		} else {
			// 2nd argument onwards could be view size, otherwise use default:
			size = Size.read(arguments, 1);
			if (size.isZero())
				size = new Size(1024, 768);
			this._canvas = CanvasProvider.getCanvas(size);
		}

		// Generate an id for this view / canvas if it does not have one
		this._id = this._canvas.id;
		if (this._id == null)
			this._canvas.id = this._id = 'canvas-' + View._id++;
/*#*/ } else if (options.browser) {
		if (canvas instanceof HTMLCanvasElement) {
			this._canvas = canvas;
			// If the canvas has the resize attribute, resize the it to fill the
			// window and resize it again whenever the user resizes the window.
			if (PaperScript.hasAttribute(canvas, 'resize')) {
				// Subtract canvas' viewport offset from the total size, to
				// stretch it in
				var offset = DomElement.getOffset(canvas, true),
					that = this;
				size = DomElement.getViewportBounds(canvas)
						.getSize().subtract(offset);
				canvas.width = size.width;
				canvas.height = size.height;
				DomEvent.add(window, {
					resize: function(event) {
						// Only update canvas offset if it's not invisible, as
						// otherwise the offset would be wrong.
						if (!DomElement.isInvisible(canvas))
							offset = DomElement.getOffset(canvas, true);
						// Set the size now, which internally calls onResize
						// and redraws the view
						that.setViewSize(DomElement.getViewportBounds(canvas)
								.getSize().subtract(offset));
					}
				});
			} else {
				size = DomElement.isInvisible(canvas)
					? Size.create(parseInt(canvas.getAttribute('width')),
							parseInt(canvas.getAttribute('height')))
					: DomElement.getSize(canvas);
			}
			// TODO: Test this on IE:
			if (PaperScript.hasAttribute(canvas, 'stats')) {
				this._stats = new Stats();
				// Align top-left to the canvas
				var element = this._stats.domElement,
					style = element.style,
					offset = DomElement.getOffset(canvas);
				style.position = 'absolute';
				style.left = offset.x + 'px';
				style.top = offset.y + 'px';
				document.body.appendChild(element);
			}
		} else {
			// 2nd argument onwards could be view size, otherwise use default:
			size = Size.read(arguments, 1);
			if (size.isZero())
				size = new Size(1024, 768);
			this._canvas = CanvasProvider.getCanvas(size);
		}
		// Generate an id for this view / canvas if it does not have one
		this._id = this._canvas.getAttribute('id');
		if (this._id == null)
			this._canvas.setAttribute('id', this._id = 'canvas-' + View._id++);
		// Install event handlers
		DomEvent.add(this._canvas, this._handlers);
/*#*/ } // options.browser
		// Keep track of views internally
		View._views.push(this);
		// Link this id to our view
		View._viewsById[this._id] = this;
		this._viewSize = LinkedSize.create(this, 'setViewSize',
				size.width, size.height);
		this._context = this._canvas.getContext('2d');
		this._matrix = new Matrix();
		this._zoom = 1;
		this._eventCounters = {};
		// Make sure the first view is focused for keyboard input straight away
		if (!View._focused)
			View._focused = this;
	},

	/**
	 * Removes this view from and frees the associated canvas.
	 */
	remove: function() {
		if (!this._project)
			return false;
		// Clear focus if removed view had it
		if (View._focused == this)
			View._focused = null;
		// Remove view from internal structures
		View._views.splice(View._views.indexOf(this), 1);
		delete View._viewsById[this._id];
		// Unlink from project
		if (this._project.view == this)
			this._project.view = null;
		// Uninstall event handlers again for this view.
		DomEvent.remove(this._canvas, this._handlers);
		this._canvas = this._project = null;
		// Removing all onFrame handlers makes the _onFrameCallback handler stop
		// automatically through its uninstall method.
		this.detach('frame');
		return true;
	},

	_redraw: function() {
		this._redrawNeeded = true;
		if (this._onFrameCallback) {
			// If there's a _onFrameCallback, call it staight away,
			// but without requesting another animation frame.
			this._onFrameCallback(0, true);
		} else {
			// Otherwise simply redraw the view now
			this.draw();
		}
	},

	_transform: function(matrix, flags) {
		this._matrix.preConcatenate(matrix);
		// Force recalculation of these values next time they are requested.
		this._bounds = null;
		this._inverse = null;
		this._redraw();
	},

	/**
	 * The underlying native canvas element.
	 *
	 * @type HTMLCanvasElement
	 * @bean
	 */
	getCanvas: function() {
		return this._canvas;
	},

	/**
	 * The size of the view canvas. Changing the view's size will resize it's
	 * underlying canvas.
	 *
	 * @type Size
	 * @bean
	 */
	getViewSize: function() {
		return this._viewSize;
	},

	setViewSize: function(size) {
		size = Size.read(arguments);
		var delta = size.subtract(this._viewSize);
		if (delta.isZero())
			return;
		this._canvas.width = size.width;
		this._canvas.height = size.height;
		// Update _viewSize but don't notify of change.
		this._viewSize.set(size.width, size.height, true);
		// Force recalculation
		this._bounds = null;
		this._redrawNeeded = true;
		// Call onResize handler on any size change
		this.fire('resize', {
			size: size,
			delta: delta
		});
		this._redraw();
	},

	/**
	 * The bounds of the currently visible area in project coordinates.
	 *
	 * @type Rectangle
	 * @bean
	 */
	getBounds: function() {
		if (!this._bounds)
			this._bounds = this._getInverse()._transformBounds(
					new Rectangle(new Point(), this._viewSize));
		return this._bounds;
	},

	/**
	 * The size of the visible area in project coordinates.
	 *
	 * @type Size
	 * @bean
	 */
	getSize: function() {
		return this.getBounds().getSize();
	},

	/**
	 * The center of the visible area in project coordinates.
	 *
	 * @type Point
	 * @bean
	 */
	getCenter: function() {
		return this.getBounds().getCenter();
	},

	setCenter: function(center) {
		this.scrollBy(Point.read(arguments).subtract(this.getCenter()));
	},

	/**
	 * The zoom factor by which the project coordinates are magnified.
	 *
	 * @type Number
	 * @bean
	 */
	getZoom: function() {
		return this._zoom;
	},

	setZoom: function(zoom) {
		// TODO: Clamp the view between 1/32 and 64, just like Illustrator?
		this._transform(new Matrix().scale(zoom / this._zoom,
			this.getCenter()));
		this._zoom = zoom;
	},

	/**
	 * Checks whether the view is currently visible within the current browser
	 * viewport.
	 *
	 * @return {Boolean} Whether the view is visible.
	 */
	isVisible: function() {
		return DomElement.isVisible(this._canvas);
	},

	/**
	 * Scrolls the view by the given vector.
	 *
	 * @param {Point} point
	 */
	scrollBy: function(point) {
		this._transform(new Matrix().translate(Point.read(arguments).negate()));
	},

	/**
	 * Draws the view.
	 *
	 * @name View#draw
	 * @function
	 */
	draw: function(checkRedraw) {
		if (checkRedraw && !this._redrawNeeded)
			return false;
		if (this._stats)
			this._stats.update();
		// Initial tests conclude that clearing the canvas using clearRect
		// is always faster than setting canvas.width = canvas.width
		// http://jsperf.com/clearrect-vs-setting-width/7
		var ctx = this._context,
			size = this._viewSize;
		ctx.clearRect(0, 0, size._width + 1, size._height + 1);

		ctx.save();
		this._matrix.applyToContext(ctx);
		this._project.draw(ctx);
		ctx.restore();
		this._redrawNeeded = false;
		return true;
	},

	// TODO: getInvalidBounds
	// TODO: invalidate(rect)
	// TODO: style: artwork / preview / raster / opaque / ink
	// TODO: getShowGrid
	// TODO: getMousePoint
	// TODO: projectToView(rect)

	projectToView: function(point) {
		return this._matrix._transformPoint(Point.read(arguments));
	},

	viewToProject: function(point) {
		return this._getInverse()._transformPoint(Point.read(arguments));
	},

	_getInverse: function() {
		if (!this._inverse)
			this._inverse = this._matrix.createInverse();
		return this._inverse;
	}

	/**
	 * {@grouptitle Event Handlers}
	 * Handler function to be called on each frame of an animation.
	 * The function receives an event object which contains information about
	 * the frame event:
	 *
	 * <b>{@code event.count}</b>: the number of times the frame event was
	 * fired.
	 * <b>{@code event.time}</b>: the total amount of time passed since the
	 * first frame event in seconds.
	 * <b>{@code event.delta}</b>: the time passed in seconds since the last
	 * frame event.
	 *
	 * @example {@paperscript}
	 * // Creating an animation:
	 *
	 * // Create a rectangle shaped path with its top left point at:
	 * // {x: 50, y: 25} and a size of {width: 50, height: 50}
	 * var path = new Path.Rectangle(new Point(50, 25), new Size(50, 50));
	 * path.fillColor = 'black';
	 *
	 * function onFrame(event) {
	 * 	// Every frame, rotate the path by 3 degrees:
	 * 	path.rotate(3);
	 * }
	 *
	 * @name View#onFrame
	 * @property
	 * @type Function
	 */

	/**
	 * Handler function that is called whenever a view is resized.
	 *
	 * @example
	 * // Repositioning items when a view is resized:
	 *
	 * // Create a circle shaped path in the center of the view:
	 * var path = new Path.Circle(view.bounds.center, 30);
	 * path.fillColor = 'red';
	 *
	 * function onResize(event) {
	 * 	// Whenever the view is resized, move the path to its center:
	 * 	path.position = view.center;
	 * }
	 *
	 * @name View#onResize
	 * @property
	 * @type Function
	 */
}, {
	statics: {
		_views: [],
		_viewsById: {},
		_id: 0,

		create: function(element) {
/*#*/ if (options.browser) {
			if (typeof element === 'string')
				element = document.getElementById(element);
/*#*/ } // options.browser
			// Factory to provide the right View subclass for a given element.
			// Produces only Canvas-Views for now:
			return new View(element);
		}
	}
}, new function() {
	// Injection scope for special code on browser (mouse events)
	// and server (rendering)
/*#*/ if (options.browser) {
	var tool,
		curPoint,
		tempFocus,
		dragging = false;

	function viewToProject(view, event) {
		return view.viewToProject(DomEvent.getOffset(event, view._canvas));
	}

	function updateFocus() {
		if (!View._focused || !View._focused.isVisible()) {
			// Find the first visible view
			for (var i = 0, l = View._views.length; i < l; i++) {
				var view = View._views[i];
				if (view && view.isVisible()) {
					View._focused = tempFocus = view;
					throw Base.stop;
				}
			}
		}
	}

	function mousedown(event) {
		var view = View._viewsById[DomEvent.getTarget(event).getAttribute('id')];
		// Tell the Key class which view should receive keyboard input.
		View._focused = view;
		curPoint = viewToProject(view, event);
		dragging = true;

		var update = false;
		// TODO: Move this to CanvasView soon!
		if (view._eventCounters.mousedown) {
			var hit = view._project.hitTest(curPoint, hitOptions);
			if (hit && hit.item) {
				update = callEvent(hit.item, new MouseEvent('mousedown',
						curPoint, hit.item, event), false);
			}
		}

		if (tool = view._scope.tool)
			update = tool.onHandleEvent('mousedown', curPoint, event)
					|| update;

		if (update)
			view.draw(true);
	}

	function mousemove(event) {
		var view;
		if (!dragging) {
			// See if we can get the view from the current event target, and
			// handle the mouse move over it.
			view = View._viewsById[DomEvent.getTarget(event).getAttribute('id')];
			if (view) {
				// Temporarily focus this view without making it sticky, so
				// Key events are handled too during the mouse over
				View._focused = tempFocus = view;
			} else if (tempFocus && tempFocus == View._focused) {
				// Clear temporary focus again and update it.
				View._focused = null;
				updateFocus();
			}
		}
		if (!(view = view || View._focused) || !(tool = view._scope.tool))
			return;
		var point = event && viewToProject(view, event);
		var onlyMove = !!(!tool.onMouseDrag && tool.onMouseMove);
		if (dragging && !onlyMove) {
			curPoint = point || curPoint;
			if (curPoint && tool.onHandleEvent('mousedrag', curPoint, event)) {
				view.draw(true);
				DomEvent.stop(event);
			}
		// PORT: If there is only an onMouseMove handler, also call it when
		// the user is dragging:
		} else if ((!dragging || onlyMove)
				&& tool.onHandleEvent('mousemove', point, event)) {
			view.draw(true);
			DomEvent.stop(event);
		}
	}

	function mouseup(event) {
		var view = View._focused;
		if (!view || !dragging)
			return;
		dragging = false;
		curPoint = null;
		if (tool) {
			if (tool.onHandleEvent('mouseup', viewToProject(view, event),
			 		event)) {
				view.draw(true);
				DomEvent.stop(event);
			}
		}
	}

	function selectstart(event) {
		// Only stop this even if we're dragging already, since otherwise no
		// text whatsoever can be selected on the page.
		if (dragging)
			DomEvent.stop(event);
	}

	// mousemove and mouseup events need to be installed on document, not the
	// view canvas, since we want to catch the end of drag events even outside
	// our view. Only the mousedown events are installed on the view, as handled
	// by _createHandlers below.

	DomEvent.add(document, {
		mousemove: mousemove,
		mouseup: mouseup,
		touchmove: mousemove,
		touchend: mouseup,
		selectstart: selectstart,
		scroll: updateFocus
	});

	DomEvent.add(window, {
		load: updateFocus
	});

	var hitOptions = {
		fill: true,
		stroke: true,
		tolerance: 0
	};

	function callEvent(item, event, bubble) {
		var called = false;
		while (item) {
			called = item.fire(event.type, event) || called;
			if (called && (!bubble || event._stopped))
				break;
			item = item.getParent();
		}
		return called;
	}

	return {
		_handlers: {
			mousedown: mousedown,
			touchstart: mousedown,
			selectstart: selectstart
		},

		statics: {
			/**
			 * Loops through all views and sets the focus on the first
			 * active one.
			 */
			updateFocus: updateFocus
		}
	};
/*#*/ } else if (options.server) {
	var path = require('path');
	// Utility function that converts a number to a string with
	// x amount of padded 0 digits:
	function toPaddedString(number, length) {
		var str = number.toString(10);
		for (var i = 0, l = length - str.length; i < l; i++) {
			str = '0' + str;
		}
		return str;
	}
	return {
		// DOCS: View#exportFrames(param);
		exportFrames: function(param) {
			param = Base.merge({
				fps: 30,
				prefix: 'frame-',
				amount: 1
			}, param);
			if (!param.directory) {
				throw new Error('Missing param.directory');
			}
			var view = this,
				count = 0,
				frameDuration = 1 / param.fps,
				lastTime = startTime = Date.now();

			// Start exporting frames by exporting the first frame:
			exportFrame(param);

			function exportFrame(param) {
				count++;
				var filename = param.prefix + toPaddedString(count, 6) + '.png',
					uri = param.directory + '/' + filename;
				var out = view.exportImage(uri, function() {
					// When the file has been closed, export the next fame:
					var then = Date.now();
					if (param.onProgress) {
						param.onProgress({
							count: count,
							amount: param.amount,
							percentage: Math.round(count / param.amount
									* 10000) / 100,
							time: then - startTime,
							delta: then - lastTime
						});
					}
					lastTime = then;
					if (count < param.amount) {
						exportFrame(param);
					} else {
						// Call onComplete handler when finished:
						if (param.onComplete) {
							param.onComplete();
						}
					}
				});
				if (view.onFrame) {
					view.onFrame({
						delta: frameDuration,
						time: frameDuration * count,
						count: count
					});
				}
			}
		},
		// DOCS: View#exportImage(uri, callback);
		exportImage: function(uri, callback) {
			this.draw();
			// TODO: is it necessary to resolve the path?
			var out = fs.createWriteStream(path.resolve(__dirname, uri)),
				stream = this._canvas.createPNGStream();
			// Pipe the png stream to the write stream:
			stream.pipe(out);
			if (callback) {
				out.on('close', callback);
			}
			return out;
		}
	};
/*#*/ } // options.server
});
