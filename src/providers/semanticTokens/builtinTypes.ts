/**
 * Qt built-in types and modules for semantic token classification.
 */

// Common Qt built-in types (for defaultLibrary modifier)
export const qtBuiltInTypes = new Set([
    // QtQuick basic types
    'Item', 'Rectangle', 'Text', 'Image', 'BorderImage', 'AnimatedImage',
    'Row', 'Column', 'Grid', 'Flow', 'Repeater', 'ListView', 'GridView',
    'PathView', 'Loader', 'Flickable', 'MouseArea', 'FocusScope',
    // QtQuick.Controls
    'Button', 'CheckBox', 'RadioButton', 'Switch', 'TextField', 'TextArea',
    'ComboBox', 'Slider', 'ProgressBar', 'Label', 'ScrollView', 'Popup',
    'Dialog', 'Menu', 'MenuBar', 'ToolBar', 'TabBar', 'ApplicationWindow',
    // QtQuick.Layouts
    'RowLayout', 'ColumnLayout', 'GridLayout', 'StackLayout',
    // Other common
    'QtObject', 'Component', 'Connections', 'Timer', 'Animation',
    'PropertyAnimation', 'NumberAnimation', 'ColorAnimation', 'RotationAnimation',
    'SequentialAnimation', 'ParallelAnimation', 'Transition', 'State', 'StateGroup',
    // Qt enum/namespace types (used for accessing enum values)
    'Qt', 'ViewSection', 'PropertyChanges'
]);

// Common Qt modules (for defaultLibrary modifier on imports)
export const qtBuiltInModules = new Set([
    'QtQuick', 'QtQuick.Controls', 'QtQuick.Layouts', 'QtQuick.Window',
    'QtQuick.Dialogs', 'QtQuick.Templates', 'QtQml', 'QtQml.Models',
    'Qt.labs.platform', 'Qt.labs.settings'
]);

// QML/JS basic type names
export const basicTypeNames = new Set([
    'int', 'bool', 'double', 'real', 'string', 'url', 'color', 'date', 'var', 'variant', 'alias'
]);

// QML/JS keywords
export const qmlKeywords = new Set([
    'import', 'as', 'property', 'signal', 'function', 'readonly', 'required', 'default',
    'component', 'on',
    // JS keywords
    'let', 'const', 'var', 'if', 'else', 'return', 'for', 'while', 'do', 'switch',
    'case', 'break', 'continue', 'new', 'this', 'true', 'false', 'null', 'undefined',
    'typeof', 'instanceof', 'in', 'delete', 'void', 'try', 'catch', 'finally', 'throw'
]);
