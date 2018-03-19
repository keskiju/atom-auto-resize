'use babel';

import { CompositeDisposable } from 'atom';

import config from './config';

export default {
  config,
  subscriptions: null,

  // Settings
  resizeWidth: true,
  resizeHeight: true,
  textEditorWidth: 676,
  windowMaxHeight: 0,
  windowMaxWidth: 0,

  // State
  initialized: false,
  wasAutoMaximized: false,
  pinTopRightCorner: false,
  savedHeight: null,

  activate(state) {
    this.subscriptions = new CompositeDisposable();

    // Listen for config changes
    this.subscribeConfig('resizeWidth');
    this.subscribeConfig('resizeHeight');
    this.subscribeConfig('textEditorWidth');
    this.subscribeConfig('windowMaxWidth');
    this.subscribeConfig('windowMaxHeight');

    // Listen for dock open/close
    [
      atom.workspace.getLeftDock(),
      atom.workspace.getRightDock(),
      atom.workspace.getBottomDock(),
    ].forEach(dock => {
      this.subscriptions.add(dock.observeVisible(() => this.triggerResize()));
    });

    // Listen for pane open/close
    this.subscriptions.add(
      atom.workspace.observePanes(pane => {
        this.triggerResize();
        this.subscriptions.add(pane.onDidDestroy(() => this.triggerResize()));
      })
    );

    // Let all panes initialize first and only then start resizing
    // TODO event subscription instead of timeout
    setTimeout(() => {
      this.initialized = true;
      this.triggerResize();
    }, 4000);
  },

  deactivate() {
    this.subscriptions.dispose();
  },

  subscribeConfig(name) {
    this[name] = atom.config.get(`atom-auto-resize.${name}`);
    this.subscriptions.add(
      atom.config.observe(`atom-auto-resize.${name}`, val => {
        this[name] = val;
      })
    );
  },

  triggerResize() {
    // Wait until at least most of the panes have been rendered/animated
    // and then execute resize a few times in case not all of them
    // have finished animation yet.
    if (this.initialized) {
      [150, 300, 600, 1000, 2000].forEach(delay => {
        setTimeout(() => this.isEnabled() && this.resizeAtom(), delay);
      });
    }
  },

  isEnabled() {
    return (
      atom.workspace.getCenter().getPanes().length &&
      !atom.isFullScreen() &&
      (!atom.isMaximized() || this.wasAutoMaximized)
    );
  },

  resizeAtom() {
    const currentPosition = atom.getPosition();
    const currentSize = atom.getSize();
    this.savePosition(currentPosition, currentSize);

    const width = this.resizeWidth
      ? this.calculateWidth(currentSize)
      : currentSize.width;
    const height = this.resizeHeight
      ? this.calculateHeight(currentSize)
      : currentSize.height;
    atom.setSize(width, height);
    this.wasAutoMaximized =
      width === screen.width && height === screen.height;

    if (this.pinTopRightCorner) {
      atom.setPosition(
        currentPosition.x - (width - currentSize.width),
        currentPosition.y);
    }
  },

  savePosition(currentPosition, currentSize) {
    // Set pinTopRightCorner setting to true if Atom window is located
    // on the right side of the screen
    if (currentSize.width <= screen.width / 2) {
      this.pinTopRightCorner = currentPosition.x >= screen.width / 2;
    }
    // Save original height
    if (!this.savedHeight || currentSize.height < this.getMaxHeight() - 4) {
      this.savedHeight = currentSize.height;
    }
  },

  getMaxWidth() {
    return this.windowMaxWidth || screen.width;
  },

  getMaxHeight() {
    return this.windowMaxHeight || screen.height;
  },

  calculateHeight(currentSize) {
    const bottomDockRectangle = this.getBottomDockRectangle();
    const editorRectangles = this.getTextEditorRectanglesSortedByTopBorder();
    return bottomDockRectangle || editorRectangles.length > 1
      ? this.getMaxHeight()
      : this.savedHeight;
  },

  calculateWidth(currentSize) {
    let w = 0;

    let prev = null;
    const rightDockRectangle = this.getRightDockRectangle();
    this.getPaneRectanglesSortedByLeftBorder().forEach(rect => {
      if (rect.left < 0) {
        // Pane is outside of Atom window left border
        w = w - rect.left;
      } else if (rect.right > currentSize.width) {
        // Pane is outside of Atom window right border
        w = w + Math.ceil(rect.right - currentSize.width);
      } else if (prev && prev.right > rect.left) {
        // Pane overlaps with the previous pane
        w = w + Math.ceil(prev.right - rect.left);
      } else if (rightDockRectangle && rect.right > rightDockRectangle.left) {
        // Pane overlaps with the right dock
        w = w + Math.ceil(rect.right - rightDockRectangle.left);
      }
      if (rect.right - rect.left !== this.textEditorWidth) {
        // Pane is not the right size
        w = w + (this.textEditorWidth - (rect.right - rect.left));
      }
      prev = rect;
    });

    let newWidth = currentSize.width + w;
    newWidth = Math.max(newWidth, this.textEditorWidth);
    newWidth = Math.min(newWidth, this.getMaxWidth());
    return newWidth;
  },

  getPaneRectanglesSortedByLeftBorder() {
    let prev = null;
    return atom.workspace.getCenter()
      .getPanes()
      .map(pane => atom.views.getView(pane).getBoundingClientRect())
      .sort((a, b) => a.left - b.left)
      .filter(cur => {
        const ret = !prev || cur.left > prev.left;
        prev = ret ? cur : prev;
        return ret;
      });
  },

  getTextEditorRectanglesSortedByTopBorder() {
    let prev = null;
    return atom.workspace.getCenter()
      .getTextEditors()
      .map(editor => atom.views.getView(editor).getBoundingClientRect())
      .sort((a, b) => a.top - b.top)
      .filter(cur => {
        const ret = cur.top && (!prev || cur.top > prev.top);
        prev = ret ? cur : prev;
        return ret;
      });
  },

  getRightDockRectangle() {
    return this.getDockRectangle(atom.workspace.getRightDock());
  },

  getBottomDockRectangle() {
    return this.getDockRectangle(atom.workspace.getBottomDock());
  },

  getDockRectangle(dock) {
    return dock.isVisible()
      ? atom.views.getView(dock).getBoundingClientRect()
      : null;
  },
};
