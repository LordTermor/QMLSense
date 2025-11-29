import QtQuick 2.15
import QtQuick.Controls 2.15
import MyComponents 1.0

ApplicationWindow {
    width: 640
    height: 480
    visible: true
    title: "Module Index Test"
    
    Column {
        anchors.centerIn: parent
        spacing: Theme.defaultMargin
        
        CustomText {
            text: "Hello from CustomText component"
            highlighted: true
        }
        
        CustomButton {
            text: "Custom Button"
            customColor: Theme.primaryColor
        }
        
        Text {
            text: "Primary: " + Theme.primaryColor
            color: Theme.secondaryColor
        }
    }
}
