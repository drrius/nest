import SwiftUI

/// Parses the subset of SVG path data used by Nest's illustrations: M L H V C S Q Z, absolute and relative.
enum SVGPath {
    static func path(_ data: String) -> Path {
        var parser = Parser(tokens: tokenize(data))
        return parser.run()
    }

    private enum Token {
        case command(Character)
        case number(CGFloat)
    }

    private static func tokenize(_ data: String) -> [Token] {
        let pattern = /[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/
        return data.matches(of: pattern).compactMap { match in
            let text = String(match.output)
            if let value = Double(text) { return .number(CGFloat(value)) }
            return text.first.map(Token.command)
        }
    }

    private struct Parser {
        let tokens: [Token]
        var index = 0
        var path = Path()
        var current = CGPoint.zero
        var start = CGPoint.zero
        var lastControl: CGPoint?

        init(tokens: [Token]) { self.tokens = tokens }

        mutating func run() -> Path {
            var command: Character = "M"
            while index < tokens.count {
                if case .command(let next) = tokens[index] {
                    command = next
                    index += 1
                    if next == "Z" || next == "z" { close() }
                    continue
                }
                apply(command)
                if command == "M" { command = "L" } else if command == "m" { command = "l" }
            }
            return path
        }

        mutating func number() -> CGFloat {
            guard index < tokens.count, case .number(let value) = tokens[index] else {
                index += 1
                return 0
            }
            index += 1
            return value
        }

        mutating func point(_ relative: Bool) -> CGPoint {
            let x = number()
            let y = number()
            return relative ? CGPoint(x: current.x + x, y: current.y + y) : CGPoint(x: x, y: y)
        }

        mutating func close() {
            path.closeSubpath()
            current = start
            lastControl = nil
        }

        mutating func apply(_ command: Character) {
            let relative = command.isLowercase
            switch command.uppercased() {
            case "M":
                current = point(relative)
                start = current
                path.move(to: current)
                lastControl = nil
            case "L": line(to: point(relative))
            case "H": line(to: CGPoint(x: (relative ? current.x : 0) + number(), y: current.y))
            case "V": line(to: CGPoint(x: current.x, y: (relative ? current.y : 0) + number()))
            case "C": cubic(point(relative), point(relative), point(relative))
            case "S": cubic(reflected(), point(relative), point(relative))
            case "Q": quad(point(relative), point(relative))
            default: index += 1
            }
        }

        mutating func line(to point: CGPoint) {
            path.addLine(to: point)
            current = point
            lastControl = nil
        }

        mutating func cubic(_ c1: CGPoint, _ c2: CGPoint, _ end: CGPoint) {
            path.addCurve(to: end, control1: c1, control2: c2)
            lastControl = c2
            current = end
        }

        mutating func quad(_ control: CGPoint, _ end: CGPoint) {
            path.addQuadCurve(to: end, control: control)
            lastControl = control
            current = end
        }

        func reflected() -> CGPoint {
            guard let lastControl else { return current }
            return CGPoint(x: 2 * current.x - lastControl.x, y: 2 * current.y - lastControl.y)
        }
    }
}
