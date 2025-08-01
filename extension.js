'use strict';

import St from 'gi://St';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const AmharicMonths = [
    "መስከረም", "ጥቅምት", "ኅዳር",
    "ታህሳስ", "ትር", "የካቲት",
    "መጋቢት", "ሚያዝያ", "ግንቦት",
    "ሰኔ", "ሐምሌ", "ነሐሴ", "ጳጉሜ"
];

const AmharicDays = [
    "እሁድ", "ሰኞ", "ማክሰኞ", "ረቡዕ", 
    "ሐሙስ", "አርብ", "ቅዳሜ"    
];

const Position = {
    FAR_LEFT: 0,
    LEFT: 1,
    CENTER: 2,
    RIGHT: 3,
    FAR_RIGHT: 4,
};

const PositionString = {
    [Position.FAR_LEFT]: 'far-left',
    [Position.LEFT]: 'left',
    [Position.CENTER]: 'center',
    [Position.RIGHT]: 'right',
    [Position.FAR_RIGHT]: 'far-right',
};

function isGregorianLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function gregorianToEthiopian(gDate) {
    // Julian day calculation
    const gYear = gDate.getFullYear();
    const gMonth = gDate.getMonth() + 1;
    const gDay = gDate.getDate();

    // Julian day number for Gregorian date
    const a = Math.floor((14 - gMonth) / 12);
    const y = gYear + 4800 - a;
    const m = gMonth + 12 * a - 3;
    const jdn = gDay + Math.floor((153 * m + 2) / 5) + 365 * y
        + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;

    const ethEpoch = 1723856;
    const r = (jdn - ethEpoch) % 1461;
    const n = (r % 365) + 365 * Math.floor(r / 1460);

    const ethYear = 4 * Math.floor((jdn - ethEpoch) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460);
    const ethMonth = Math.floor(n / 30) + 1;
    const ethDay = (n % 30) + 1;

    return { year: ethYear, month: ethMonth, day: ethDay };
}

function getAmharicDayName(date) {
    return AmharicDays[date.getDay()] || '';
}

function getEthiopianDateString(date = new Date()) {
    const ethDate = gregorianToEthiopian(date);
    return `${ethDate.day} ${AmharicMonths[ethDate.month - 1]} ${ethDate.year}`;
}

const EthiopianCalendarIndicator = GObject.registerClass(
class EthiopianCalendarIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'Ethiopian Calendar');
        this._extension = extension;

        this._label = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._label.set_style(`
            font-weight: bold;
            font-size: 12px;
            color: white;
        `);
        this.add_child(this._label);

        this._timeoutId = 0;

        this._dateFormat = this._extension._settings.get_string('date-format');

        // date format options
        this._dateFormatOptions = [
            '{day} {month} {year}',
            '{month} {day}, {year}',
            '{year} {month} {day}',
        ];

        // Connecting to changes in 'date-format' key to update live
        this._formatChangedId = this._extension._settings.connect('changed::date-format', () => {
            this._dateFormat = this._extension._settings.get_string('date-format');
            this._updateDate();
            this._refreshDateFormatMenuItems(); // Update date format submenu checkmarks
        });

        // Connect to show-day changes
        this._showDayChangedId = this._extension._settings.connect('changed::show-day', () => {
            this._updateDate();
        });

        this._updateDate();
        this._startTimer();

        // Panel Position submenu
        this.positionSubMenu = new PopupMenu.PopupSubMenuMenuItem(_('Panel Position'));
        const positionLabels = ['Far Left', 'Left', 'Center', 'Right', 'Far Right'];

        this._refreshPositionMenuItems = () => {
            this.positionSubMenu.menu.removeAll();
            const currentPos = this._extension._settings.get_int('position');

            positionLabels.forEach((label, idx) => {
                const item = new PopupMenu.PopupMenuItem(_(label));

                if (idx === currentPos)
                    item.actor.add_style_class_name('popup-menu-item-checked');

                // Update setting on activate
                item.connect('activate', () => {
                    this._extension._settings.set_int('position', idx);
                    this._refreshPositionMenuItems();
                });

                // Prevent menu from closing on click
                item.actor.connect('button-press-event', (actor, event) => {
                    event.stopPropagation();
                    return Clutter.EVENT_STOP;
                });

                this.positionSubMenu.menu.addMenuItem(item);
            });
        };

        this._refreshPositionMenuItems();
        this.menu.addMenuItem(this.positionSubMenu);

        // Date Format submenu
        this._dateFormatSubMenu = new PopupMenu.PopupSubMenuMenuItem(_('Date Format'));

        this._refreshDateFormatMenuItems = () => {
            this._dateFormatSubMenu.menu.removeAll();
            const currentFormat = this._extension._settings.get_string('date-format');

            this._dateFormatOptions.forEach(format => {
                const item = new PopupMenu.PopupMenuItem(format);
                if (format === currentFormat)
                    item.actor.add_style_class_name('popup-menu-item-checked');

                // Use activate here since changing date format won't close submenu by default
                item.connect('activate', () => {
                    this._extension._settings.set_string('date-format', format);
                    this._refreshDateFormatMenuItems();
                    this._updateDate();
                });

                this._dateFormatSubMenu.menu.addMenuItem(item);
            });
        };

        this._refreshDateFormatMenuItems();
        this.menu.addMenuItem(this._dateFormatSubMenu);

        // Show Day of Week switch
        const showDaySwitch = new PopupMenu.PopupSwitchMenuItem(
            _('Show Day of Week'),
            this._extension._settings.get_boolean('show-day')
        );

        showDaySwitch.connect('toggled', (item, state) => {
            this._extension._settings.set_boolean('show-day', state);
        });

        // Prevent the menu from closing after toggling switch
        showDaySwitch.actor.connect('button-press-event', (actor, event) => {
            event.stopPropagation();
            return Clutter.EVENT_STOP;
        });

        this.menu.addMenuItem(showDaySwitch);

        // Separator and Preferences menu item
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const prefsItem = new PopupMenu.PopupMenuItem(_('Preferences'));
        prefsItem.connect('activate', () => {
            this._extension.openPrefs();
        });
        this.menu.addMenuItem(prefsItem);
    }

    _updateDate() {
        if (!this._extension || !this._extension._settings) return;

        const showDay = this._extension._settings.get_boolean('show-day');
        const now = new Date();

        // Ethiopian date parts
        const ethDate = gregorianToEthiopian(now);

        // Format the date string using the user-defined format
        let text = this._dateFormat || '{day} {month} {year}';

        text = text.replace(/{day}/g, ethDate.day.toString());
        text = text.replace(/{month}/g, AmharicMonths[ethDate.month - 1]);
        text = text.replace(/{year}/g, ethDate.year.toString());

        if (showDay) {
            const dayName = getAmharicDayName(now);
            text = `${dayName} - ${text}`;
        }

        this._label.set_text(text);
    }

    _startTimer() {
        if (this._timeoutId)
            GLib.source_remove(this._timeoutId);
        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
            this._updateDate();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopTimer() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
    }

    destroy() {
        if (this._formatChangedId)
            this._extension._settings.disconnect(this._formatChangedId);
        if (this._showDayChangedId)
            this._extension._settings.disconnect(this._showDayChangedId);
        this._stopTimer();
        super.destroy();
    }
});

export default class EthiopianCalendarExtension extends Extension {
    _indicator = null;
    _settingsChangedId = 0;
    _positionChangedId = 0;

    constructor(metadata) {
        super(metadata);
    }

    _placeIndicator() {
        if (!this._indicator) return;

        const pos = this._settings.get_int('position');
        const posStr = PositionString[pos] || 'center';

        if (this._indicator.get_parent())
            this._indicator.get_parent().remove_child(this._indicator);

        switch (posStr) {
            case 'far-left':
                Main.panel._leftBox.insert_child_at_index(this._indicator, 0);
                break;
            case 'left':
                Main.panel._leftBox.add_child(this._indicator);
                break;
            case 'center':
                Main.panel._centerBox.insert_child_at_index(this._indicator, 0);
                break;
            case 'right':
                Main.panel._rightBox.insert_child_at_index(this._indicator, 0);
                break;
            case 'far-right':
                Main.panel._rightBox.add_child(this._indicator);
                break;
            default:
                Main.panel._centerBox.insert_child_at_index(this._indicator, 0);
        }
    }

    enable() {
        this._settings = this.getSettings();

        this._indicator = new EthiopianCalendarIndicator(this);
        this._placeIndicator();

        this._settingsChangedId = this._settings.connect('changed::show-day', () => {
            if (this._indicator)
                this._indicator._updateDate();
        });

        this._positionChangedId = this._settings.connect('changed::position', () => {
            this._placeIndicator();
        });
    }

    disable() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
        if (this._positionChangedId) {
            this._settings.disconnect(this._positionChangedId);
            this._positionChangedId = 0;
        }
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
