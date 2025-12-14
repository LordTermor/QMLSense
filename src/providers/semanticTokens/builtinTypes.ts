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
export const jsBuiltinGlobals = new Set([
    'console',
    'Math',
    'JSON',
    'Date',
    'Array',
    'Object',
    'String',
    'Number',
    'Boolean',
    'RegExp',
    'Error',
    'undefined',
    'NaN',
    'Infinity',
    'Qt',
    'print'
]);

export const jsBuiltinMembers = new Set([
    'console.log',
    'console.debug',
    'console.info',
    'console.warn',
    'console.error',
    'console.assert',
    'console.time',
    'console.timeEnd',
    'console.trace',
    'console.count',
    'console.profile',
    'console.profileEnd',
    'Math.abs',
    'Math.acos',
    'Math.asin',
    'Math.atan',
    'Math.atan2',
    'Math.ceil',
    'Math.cos',
    'Math.exp',
    'Math.floor',
    'Math.log',
    'Math.max',
    'Math.min',
    'Math.pow',
    'Math.random',
    'Math.round',
    'Math.sin',
    'Math.sqrt',
    'Math.tan',
    'Math.E',
    'Math.LN10',
    'Math.LN2',
    'Math.LOG10E',
    'Math.LOG2E',
    'Math.PI',
    'Math.SQRT1_2',
    'Math.SQRT2',
    
    // JSON methods
    'JSON.stringify',
    'JSON.parse',
    
    // Qt object methods (QML-specific)
    'Qt.quit',
    'Qt.exit',
    'Qt.rgba',
    'Qt.hsla',
    'Qt.hsva',
    'Qt.darker',
    'Qt.lighter',
    'Qt.tint',
    'Qt.formatDate',
    'Qt.formatTime',
    'Qt.formatDateTime',
    'Qt.font',
    'Qt.point',
    'Qt.size',
    'Qt.rect',
    'Qt.vector2d',
    'Qt.vector3d',
    'Qt.vector4d',
    'Qt.quaternion',
    'Qt.matrix4x4',
    'Qt.url',
    'Qt.md5',
    'Qt.btoa',
    'Qt.atob',
    'Qt.binding',
    'Qt.locale',
    'Qt.resolvedUrl',
    'Qt.openUrlExternally',
    'Qt.fontFamilies',
    'Qt.include',
    'Qt.isQtObject',
    'Qt.callLater',
    'Qt.platform',
    'Qt.application',
    'Qt.inputMethod',
    'Qt.styleHints'
]);
