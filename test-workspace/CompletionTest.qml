import QtQuick 2.15
import QtQuick.Controls 2.15

// Test completions:
// 1. Type "Rec" and press Ctrl+Space - should suggest Rectangle
// 2. Inside Rectangle { }, type "col" and press Ctrl+Space - should suggest color
// 3. Type "parent." and see member completions
// 4. Hover over "Rectangle" to see type info
// 5. Hover over "color" to see property info

Rectangle {
    id: myRect
    // Type here and press Ctrl+Space to see property completions
    
    
    // Hover over types and properties to see documentation
    Text {
        text: "Test"
        // Type "col" here for completions
        
    }
}
