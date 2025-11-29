import QtQuick 2.15

CustomButton {
    id: testButton
    // This should allow go-to-definition on CustomButton (same module)
    // and also on CustomText below
    
    CustomText {
        text: "Inside TestButton"
    }

}
