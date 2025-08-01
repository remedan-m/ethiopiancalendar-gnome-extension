'use strict';

import Adw     from 'gi://Adw';
import Gio     from 'gi://Gio';
import Gtk     from 'gi://Gtk';
import GObject from 'gi://GObject';

import {
    ExtensionPreferences,
    gettext as _
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const Position = {
    FAR_LEFT: 0,
    LEFT: 1,
    CENTER: 2,
    RIGHT: 3,
    FAR_RIGHT: 4,
};
const PositionTextRAW = {
    [Position.FAR_LEFT] : 'Far Left',
    [Position.LEFT]     : 'Left',
    [Position.CENTER]   : 'Center',
    [Position.RIGHT]    : 'Right',
    [Position.FAR_RIGHT]: 'Far Right',
};

const OptionButton = GObject.registerClass(
class OptionButton extends Gtk.ToggleButton {
    _init(label, active) {
        super._init({
            label,
            active,
            can_focus: true,
            css_classes: ['option-button'],
        });
        if (active)
            this.add_css_class('active');

        this.connect('toggled', btn => {
            if (btn.active)
                btn.add_css_class('active');
            else
                btn.remove_css_class('active');
        });
    }
});

const SegmentedRow = class {
    constructor(title, textMap, currentIndex, onChange) {
        this.row = new Adw.ActionRow({ activatable: false, selectable: false });
        this.row.add_css_class('no-row-hover');

        const titleLbl = new Gtk.Label({
            label: title,
            xalign: 0,
            halign: Gtk.Align.START,
            valign: Gtk.Align.CENTER,
        });

        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 2,
            css_classes: ['linked'],
            hexpand: false,
        });
        this.row.add_prefix(box);
        this.row.add_prefix(titleLbl);

        this._buttons = Object.entries(textMap).map(([key, label]) => {
            const idx = Number(key);
            const btn = new OptionButton(label, idx === currentIndex);
            btn.connect('toggled', () => {
                if (!btn.active) return;
                this._buttons.forEach(b => (b.active = b === btn));
                onChange(idx);
            });
            box.append(btn);
            return btn;
        });
    }
};


export default class EthiopianCalendarPreferences extends ExtensionPreferences {

    fillPreferencesWindow(window) {
        const settings = this.getSettings('org.gnome.shell.extensions.ethiopiancalendar');

        const tr = raw => Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, _(v)]));
        const PositionText = tr(PositionTextRAW);

        // Date Format options (array index is the id)
        const DateFormatOptionsRAW = [
            '{day} {month} {year}',
            '{month} {day}, {year}',
            '{year} {month} {day}',
        ];

        // Localized labels for dropdown display
        const DateFormatLabelsRAW = [
            _('{day} {month} {year}'),
            _('{month} {day}, {year}'),
            _('{year} {month} {day}'),
        ];

        // Create preferences page
        const page = new Adw.PreferencesPage({ title: _('Ethiopian Calendar Settings') });
        window.add(page);

        // General settings group
        const general = new Adw.PreferencesGroup({ title: _('General Settings') });
        page.add(general);

        // Panel Position buttons
        general.add(new SegmentedRow(
            _('Panel Position'), PositionText,
            settings.get_int('position'),
            idx => settings.set_int('position', idx)
        ).row);

        // Date Format dropdown
        const currentFormatString = settings.get_string('date-format');
        let currentFormatIndex = DateFormatOptionsRAW.indexOf(currentFormatString);
        if (currentFormatIndex < 0)
            currentFormatIndex = 0;

        const listStore = new Gtk.StringList();
        DateFormatLabelsRAW.forEach(label => listStore.append(label));

        const dateFormatComboRow = new Adw.ComboRow({
            title: _('Date Format'),
            model: listStore,
            selected: currentFormatIndex,
        });

        dateFormatComboRow.connect('notify::selected', w => {
            const idx = w.selected;
            if (idx >= 0 && idx < DateFormatOptionsRAW.length)
                settings.set_string('date-format', DateFormatOptionsRAW[idx]);
        });
        general.add(dateFormatComboRow);

        // Reset button row for Date Format
        const resetFmtBtn = new Gtk.Button({
            label: _('Reset Date Format'),
            hexpand: false,
            halign: Gtk.Align.START,
        });
        resetFmtBtn.connect('clicked', () => {
            settings.set_string('date-format', DateFormatOptionsRAW[0]);
            dateFormatComboRow.selected = 0;
        });
        general.add(new Adw.ActionRow({
            activatable: false,
            selectable: false,
            child: resetFmtBtn,
        }));

        // Display
        const dayGrp = new Adw.PreferencesGroup({ title: _('Display Options') });
        page.add(dayGrp);

        // Show Day of Week switch
        const showDayRow = new Adw.ActionRow({ title: _('Show Day of Week'), activatable: true });
        const daySwitch = new Gtk.Switch({
            active: settings.get_boolean('show-day'),
            valign: Gtk.Align.CENTER,
            css_classes: ['show-day-switch'],
        });
        showDayRow.add_suffix(daySwitch);
        settings.bind('show-day', daySwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
        dayGrp.add(showDayRow);
    }
}
