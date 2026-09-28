import Foundation

/// Keep tool payloads intact; never turn an unrecognized tool result into a success message.
indirect enum AssistantJSON: Decodable, Equatable, Sendable {
    case null, bool(Bool), string(String), number(Decimal)
    case array([AssistantJSON]), object([String: AssistantJSON])

    init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer()
        if value.decodeNil() {
            self = .null
        } else if let bool = try? value.decode(Bool.self) {
            self = .bool(bool)
        } else if let string = try? value.decode(String.self) {
            self = .string(string)
        } else if let number = try? value.decode(Decimal.self) {
            self = .number(number)
        } else if let array = try? value.decode([AssistantJSON].self) {
            self = .array(array)
        } else {
            self = .object(try value.decode([String: AssistantJSON].self))
        }
    }

    var string: String? {
        if case .string(let value) = self { return value }
        return nil
    }
}
