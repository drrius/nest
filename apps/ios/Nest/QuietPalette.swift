import SwiftUI

enum QuietPalette {
    static let background = adaptive(0xFAFBF7, 0x151E19)
    static let surface = adaptive(0xFFFFFF, 0x202D25)
    static let onAccent = adaptive(0xFAFBF7, 0x151E19)
    static let ink = adaptive(0x273A31, 0xEEF2E9)
    static let muted = adaptive(0x646E65, 0xB1BEB2)
    static let accent = adaptive(0x335D49, 0xB4D3AF)
    static let soft = adaptive(0xEAF0E6, 0x304235)
    static let border = adaptive(0xDDE3D8, 0x405346)

    private static func adaptive(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(
            uiColor: UIColor { traits in
                let value = traits.userInterfaceStyle == .dark ? dark : light
                return UIColor(
                    red: CGFloat((value >> 16) & 0xFF) / 255,
                    green: CGFloat((value >> 8) & 0xFF) / 255,
                    blue: CGFloat(value & 0xFF) / 255,
                    alpha: 1
                )
            })
    }
}
