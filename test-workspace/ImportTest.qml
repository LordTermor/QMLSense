// Test file for import alias highlighting and references
// Try: Click on "QQC" in import statement or in QQC.Button
// Expected: All QQC references should highlight (import + all usages)
import QtQuick 2.15
import QtQuick.Controls 2.15 as QQC
import QtQuick.Layouts 1.15 as Layouts
import "./MyComponents"

Rectangle {
    id: root
    width: 400
    height: 300
    color: "lightgray"

    property int clickCount: 0

    // Try: Click on "clickCount" - should highlight declaration + all references
    // Try: Click on "root" - should highlight id + all references

    // Using qualified type names - QQC and Layouts should be highlighted as variable references
    Layouts.ColumnLayout {
        anchors.fill: parent
        spacing: 10

        QQC.Button {
            text: "Button from QtQuick.Controls via QQC alias"
            Layout.fillWidth: true
            onClicked: root.clickCount++  // Click "root" to see all references
        }

        QQC.TextField {
            placeholderText: "TextField using QQC qualifier"
            Layout.fillWidth: true
        }

        QQC.Label {
            text: "Clicked " + root.clickCount + " times"  // Click "clickCount" to see references
        }

        // Direct QtQuick type (no qualifier)
        Text {
            text: "Direct QtQuick.Text component"
            font.pixelSize: 16
        }

        // Try: Right-click on "QQC" -> Find All References (should show import + 3 usages)
        QQC.Button {
            text: "Another QQC button"
        }
    }
}
