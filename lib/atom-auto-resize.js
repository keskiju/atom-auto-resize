'use babel';

import { CompositeDisposable } from 'atom';

import config from './config';

export default {
  config,
  subscriptions: null,
  savedHeight: null,
  wasAutoMaximized: false,
  initialized: false,

  // Settings
  resizeWidth: true,
  resizeHeight: true,
  textEditorWidth: 676,

  activate(state) {
    this.subscriptions = new CompositeDisposable();

    // Listen for config changes
    this.subscribeConfig('resizeWidth');
    this.subscribeConfig('resizeHeight');
    this.subscribeConfig('textEditorWidth');

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
      [100, 200, 500, 1000].forEach(delay => {
        setTimeout(() => this.isEnabled() && this.resizeAtom(), delay);
      });
    }
  },

  isEnabled() {
    return (
      atom.workspace.getTextEditors().length &&
      !atom.isFullScreen() &&
      (!atom.isMaximized() || this.wasAutoMaximized)
    );
  },

  resizeAtom() {
    const currentSize = atom.getSize();
    this.saveSize(currentSize);
    const width = this.resizeWidth
      ? this.calculateWidth(currentSize)
      : currentSize.width;
    const height = this.resizeHeight
      ? this.calculateHeight(currentSize)
      : currentSize.height;
    atom.setSize(width, height);
    this.wasAutoMaximized = width === screen.width && height === screen.height;
  },

  saveSize(currentSize) {
    if (!this.savedHeight || currentSize.height < screen.height - 10) {
      this.savedHeight = currentSize.height;
    }
  },

  calculateHeight(currentSize) {
    const bottomDockRectangle = this.getBottomDockRectangle();
    const editorRectangles = this.getTextEditorRectanglesSortedByTopBorder();
    return bottomDockRectangle || editorRectangles.length > 1
      ? screen.height
      : this.savedHeight;
  },

  calculateWidth(currentSize) {
    let w = 0;

    let prev = null;
    this.getTextEditorRectanglesSortedByLeftBorder().forEach(rect => {
      if (rect.left < 0) {
        // Text editor is outside of Atom window left border
        w = w - rect.left;
      }
      if (rect.right - rect.left !== this.textEditorWidth) {
        // Text editor is not the right size
        w = w + (this.textEditorWidth - (rect.right - rect.left));
      }
      if (prev && prev.right > rect.left) {
        // Text editor overlaps with the previous one
        w = w + Math.ceil(prev.right - rect.left);
      }
      prev = rect;
    });

    const rightDockRectangle = this.getRightDockRectangle();
    if (rightDockRectangle && prev && prev.right > rightDockRectangle.left) {
      // Text editor overlaps with the right dock
      w = w + Math.ceil(prev.right - rightDockRectangle.left);
    }

    let newWidth = currentSize.width + w;
    newWidth = Math.max(newWidth, this.textEditorWidth);
    newWidth = Math.min(newWidth, screen.width);
    return newWidth;
  },

  getTextEditorRectanglesSortedByLeftBorder() {
    let prev = null;
    return atom.workspace
      .getTextEditors()
      .map(editor => atom.views.getView(editor).getBoundingClientRect())
      .sort((a, b) => a.left - b.left)
      .filter(cur => {
        const ret = cur.right && (!prev || cur.left > prev.left);
        prev = ret ? cur : prev;
        return ret;
      });
  },

  getTextEditorRectanglesSortedByTopBorder() {
    let prev = null;
    return atom.workspace
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
