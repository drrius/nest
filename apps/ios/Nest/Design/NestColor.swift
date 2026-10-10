import SwiftUI

/// Semantic colours for the Nest redesign. Warm paper, one forest green for actions, soft domain tints.
enum NestColor {
    static let background = adaptive(0xF6F4EE, 0x111512)
    static let card = adaptive(0xFFFFFF, 0x1B201C)
    static let ink = adaptive(0x1C2520, 0xEDF0EA)
    static let ink2 = adaptive(0x5F675F, 0xA2AAA2)
    static let ink3 = adaptive(0x6B7269, 0x8C948C)
    static let line = adaptive(0x1C2520, 0xEDF0EA, lightAlpha: 0.085, darkAlpha: 0.09)
    static let fill = adaptive(0x1C2520, 0xEDF0EA, lightAlpha: 0.05, darkAlpha: 0.07)
    static let fill2 = adaptive(0x1C2520, 0xEDF0EA, lightAlpha: 0.085, darkAlpha: 0.12)

    static let accent = adaptive(0x2D5A43, 0x8FCAA6)
    static let accentSoft = adaptive(0xE2EBE1, 0x1F3328)
    static let accentInk = adaptive(0x2D5A43, 0x9FD4B3)
    static let onAccent = adaptive(0xF7F5EF, 0x0F1A14)

    static let good = adaptive(0x3B8A5A, 0x79C495)
    static let goodSoft = adaptive(0xDFEEE4, 0x1B3324)
    static let warn = adaptive(0xB5671A, 0xEBA65A)
    static let warnSoft = adaptive(0xF9EADA, 0x3A2A17)
    static let bad = adaptive(0xC8463A, 0xF08A7E)

    static func tint(_ domain: NestDomain) -> Color {
        switch domain {
        case .house: adaptive(0x3B8A5A, 0x79C495)
        case .meal: adaptive(0xD06A2C, 0xF39A62)
        case .groceries: adaptive(0x2A8F82, 0x5FC4B6)
        case .calendar: adaptive(0x7559C2, 0xA68DF0)
        case .money: adaptive(0xA9790B, 0xE3B648)
        case .bill: adaptive(0xC5536A, 0xEC8399)
        case .neutral: adaptive(0x5F675F, 0xA2AAA2)
        }
    }

    static func tintSoft(_ domain: NestDomain) -> Color {
        switch domain {
        case .house: adaptive(0xE0EEE4, 0x1C3125)
        case .meal: adaptive(0xFBE8DA, 0x3B2618)
        case .groceries: adaptive(0xD9EEEA, 0x15322E)
        case .calendar: adaptive(0xEBE5F7, 0x2A2340)
        case .money: adaptive(0xF5EBCD, 0x3A3014)
        case .bill: adaptive(0xF7DFE3, 0x3B1D24)
        case .neutral: adaptive(0xECEAE3, 0x252B26)
        }
    }

    static func adaptive(_ light: UInt32, _ dark: UInt32, lightAlpha: CGFloat = 1, darkAlpha: CGFloat = 1) -> Color {
        Color(
            uiColor: UIColor { traits in
                let isDark = traits.userInterfaceStyle == .dark
                return UIColor(hex: isDark ? dark : light, alpha: isDark ? darkAlpha : lightAlpha)
            })
    }
}

/// Household areas, each with a soft tint used for icon tiles only.
enum NestDomain: Sendable {
    case house, meal, groceries, calendar, money, bill, neutral
}

extension UIColor {
    convenience init(hex value: UInt32, alpha: CGFloat = 1) {
        self.init(
            red: CGFloat((value >> 16) & 0xFF) / 255,
            green: CGFloat((value >> 8) & 0xFF) / 255,
            blue: CGFloat(value & 0xFF) / 255,
            alpha: alpha)
    }
}

extension MemberColor {
    var color: Color {
        let (light, dark) = tones
        return NestColor.adaptive(light, dark)
    }

    var soft: Color {
        let (light, dark) = softTones
        return NestColor.adaptive(light, dark)
    }

    /// Text on the colour: white where it reads at 3:1 or better, otherwise dark ink. Dark tones are all light.
    var onColor: Color {
        let ink: UInt32 = 0x1C2520
        let light: UInt32 = self == .clay || self == .marigold ? ink : 0xFFFFFF
        return NestColor.adaptive(light, ink)
    }

    private var tones: (UInt32, UInt32) {
        switch self {
        case .lake: (0x4A80BD, 0x7FB0E6)
        case .clay: (0xCF6F48, 0xEE9873)
        case .plum: (0x8B5DB8, 0xB994E6)
        case .rose: (0xCF4F78, 0xF08AA9)
        case .marigold: (0xC98A12, 0xEBB54A)
        case .teal: (0x23898A, 0x5FC4C4)
        case .indigo: (0x5163C8, 0x8D9BF0)
        case .slate: (0x5C6A78, 0xA1B0BF)
        }
    }

    private var softTones: (UInt32, UInt32) {
        switch self {
        case .lake: (0xE1EBF6, 0x1C2B3B)
        case .clay: (0xF7E5DC, 0x3A251C)
        case .plum: (0xEEE6F6, 0x2C2240)
        case .rose: (0xF8E0E8, 0x3B1D27)
        case .marigold: (0xF8EDD2, 0x3A2E12)
        case .teal: (0xD7EDED, 0x15302F)
        case .indigo: (0xE3E6F8, 0x1F2340)
        case .slate: (0xE4E8EC, 0x242A30)
        }
    }
}
