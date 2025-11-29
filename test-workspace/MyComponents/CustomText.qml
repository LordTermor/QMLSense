import QtQuick 2.15

Text {
    id: root
    
    property bool highlighted: false
    
    font.bold: highlighted
    color: highlighted ? "yellow" : "white"
}
