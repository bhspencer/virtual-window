// Where the page's picture is on the physical screen. The settings give the whole display's size; the
// browser draws only in its window, which may be smaller and lower down (under the tabs and address
// bar). The window in the scene is that picture, not the whole display.

/**
 * The picture's rectangle, in metres, relative to the display's centre (x right, y up).
 *
 * @param display   the whole display: `{ w, h }` in metres, and `{ pxW, pxH }` in CSS pixels
 * @param page      the page's drawing area on the display in CSS pixels: `{ left, top, width, height }`
 * @returns `{ cx, cy, w, h }`: the picture's centre and size in metres
 */
export function pictureRect(display, page) {
    const mx = display.w / display.pxW;
    const my = display.h / display.pxH;
    // Never let a guessed position put the picture off the display.
    const width = Math.min(page.width, display.pxW);
    const height = Math.min(page.height, display.pxH);
    const left = Math.min(Math.max(0, page.left), display.pxW - width);
    const top = Math.min(Math.max(0, page.top), display.pxH - height);
    return {
        cx: (left + width / 2) * mx - display.w / 2,
        cy: display.h / 2 - (top + height / 2) * my,
        w: width * mx,
        h: height * my
    };
}

/**
 * The page's drawing area on the display, as well as the browser lets us know it. In fullscreen it's
 * the whole display. Otherwise it's estimated from the browser window's position and its frame: the
 * tabs and address bar are taken to be above the page, and any border split evenly. (Some systems,
 * Wayland among them, don't say where the window is, so it's taken as at the top left.)
 */
export function pageOnDisplay(win = window) {
    const s = win.screen;
    const width = win.innerWidth;
    const height = win.innerHeight;
    if (win.document?.fullscreenElement || (width >= s.width - 1 && height >= s.height - 1)) {
        return { left: (s.width - width) / 2, top: (s.height - height) / 2, width, height };
    }
    const border = Math.max(0, (win.outerWidth - width) / 2);
    const left = win.screenX - (s.left ?? 0) + border;
    const top = win.screenY - (s.top ?? 0) + Math.max(0, win.outerHeight - height - border);
    return { left, top, width, height };
}
