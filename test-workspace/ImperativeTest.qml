import QtQuick 2.15
import QtQuick.Controls 2.15 as QQC

// Test file for imperative JavaScript support
Rectangle {
    id: root
    width: 400
    height: 300
    
    property int clickCount: 0
    property string message: "Hello"
    
    // Test 1: Ternary expression in binding
    color: enabled ? "lightblue" : "gray"
    
    // Test 2: Binary expression with Math
    property real angle: Math.PI / 2
    property real randomValue: Math.random() * 100
    
    // Test 3: Function with imperative code
    function calculate(x, y) {
        // Console logging
        console.log("Calculating:", x, y);
        
        // Variable declarations
        const sum = x + y;
        let result = sum * 2;
        
        // Conditional
        if (result > 10) {
            console.warn("Result is large:", result);
            return Math.floor(result);
        } else {
            console.debug("Result is small");
            return Math.ceil(result);
        }
    }
    
    // Test 4: Ternary in function
    function getMessage(count) {
        return count > 0 ? "Multiple clicks" : "No clicks";
    }

    
    QQC.Button {
        text: "Click me"
        anchors.centerIn: parent
        
        // Test 5: Single-line imperative binding
        onClicked: root.clickCount++
        
        // Test 6: Multi-line imperative block
        onPressed: {
            console.log(clickCount > 0 ? "Another click!" : "First click!");
            
            // Qt object methods
            const color = Qt.rgba(Math.random(), Math.random(), Math.random(), 1.0);
            root.color = color;
            
            // JSON operations
            const data = JSON.stringify({ count: clickCount, msg: message });
            console.info("Data:", data);
            
            // Math operations
            const angle = Math.atan2(100, 200);
            console.log("Angle:", angle, "PI:", Math.PI);
        }
    }
    
    Text {
        text: getMessage(clickCount)
        anchors.top: parent.top
        anchors.margins: 10
        
        // Ternary in property binding
        color: clickCount > 5 ? "red" : "black"
        font.bold: clickCount % 2 === 0
    } 
}
