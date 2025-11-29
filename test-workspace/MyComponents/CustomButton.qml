import QtQuick 2.15
import QtQuick.Controls 2.15

Button {
    id: root
    
    property color customColor: "blue"
    
    background: Rectangle {
        color: root.customColor
        radius: 4
    }
}
