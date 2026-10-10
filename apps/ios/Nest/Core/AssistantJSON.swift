import Foundation

/// Keep tool payloads intact; never turn an unrecognized tool result into a success message.
indirect enum AssistantJSON: Codable, Equatable, Sendable {
    case null
    case bool(Bool)
    case string(String)
    case number(Decimal)
    case array([AssistantJSON])
    case object([String: AssistantJSON])

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

    func encode(to encoder: Encoder) throws {
        var value = encoder.singleValueContainer()
        switch self {
        case .null: try value.encodeNil()
        case .bool(let item): try value.encode(item)
        case .string(let item): try value.encode(item)
        case .number(let item): try value.encode(item)
        case .array(let items): try value.encode(items)
        case .object(let items): try value.encode(items)
        }
    }
}
