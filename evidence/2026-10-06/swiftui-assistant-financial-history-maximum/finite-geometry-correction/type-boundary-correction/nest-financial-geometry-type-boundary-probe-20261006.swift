import Foundation
import CoreGraphics

struct ExtractedGeometryProbe {
    private func usable(_ frame: CGRect) -> Bool {
        [frame.minX, frame.minY, frame.width, frame.height, frame.maxX, frame.maxY, frame.midX, frame.midY].allSatisfy {
            $0.isFinite
        }
            && !frame.isNull && !frame.isInfinite && frame.width > 0 && frame.height > 0
    }

    private func diagnostic(_ frame: CGRect) -> [String: Any] {
        let fields = [
            "minX": frame.minX, "minY": frame.minY, "width": frame.width, "height": frame.height,
            "maxX": frame.maxX, "maxY": frame.maxY, "midX": frame.midX, "midY": frame.midY,
        ]
        var result: [String: Any] = ["isNull": frame.isNull, "isInfinite": frame.isInfinite, "usable": usable(frame)]
        for (name, value) in fields {
            result[name] =
                value.isFinite
                ? Double(value) as Any
                : [
                    "state": "nonfinite", "rawType": "CGFloat", "representation": String(describing: value),
                ]
        }
        return result
    }

    func inspect(_ name: String, _ frame: CGRect, expected: Bool) throws -> [String: Any] {
        let value = diagnostic(frame)
        precondition(usable(frame) == expected, "Unexpected usability: \(name)")
        precondition(JSONSerialization.isValidJSONObject(value))
        let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        let roundTrip = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        for field in ["minX", "minY", "width", "height", "maxX", "maxY", "midX", "midY"] {
            if let tag = roundTrip[field] as? [String: Any] {
                precondition(tag["state"] as? String == "nonfinite")
                precondition(tag["rawType"] as? String == "CGFloat")
                precondition(tag["representation"] as? String != "0")
            }
        }
        if name == "null" || name == "explicit-infinity" {
            precondition(roundTrip["minX"] is [String: Any])
        }
        if name == "NaN" { precondition(roundTrip["minX"] is [String: Any]) }
        if name == "computed-edge-overflow" { precondition(roundTrip["maxX"] is [String: Any]) }
        return ["case": name, "usable": usable(frame), "expectedUsable": expected,
                "validJSONObject": true, "actualSerializationBytes": data.count,
                "diagnostic": roundTrip]
    }
}

let probe = ExtractedGeometryProbe()
let cases: [(String, CGRect, Bool)] = [
    ("finite", CGRect(x: 16, y: 100, width: 343, height: 119), true),
    ("zero", .zero, false),
    ("null", .null, false),
    ("infinite-rect", .infinite, false),
    ("explicit-infinity", CGRect(x: CGFloat.infinity, y: 10, width: 20, height: 20), false),
    ("NaN", CGRect(x: CGFloat.nan, y: 10, width: 20, height: 20), false),
    ("computed-edge-overflow", CGRect(x: CGFloat.greatestFiniteMagnitude, y: 10,
                                    width: CGFloat.greatestFiniteMagnitude, height: 20), false),
]
let results = try cases.map { try probe.inspect($0.0, $0.1, expected: $0.2) }
let metadata = try JSONSerialization.jsonObject(with: Data("{\"source\":\"apps/ios/UITests/AssistantFinancialHistoryMaximumReading.swift\",\"sourceSha256\":\"73ab3acb3891fc07e1ca35faa13bed775dbad76026f2f69e1e40a889d4671bf7\",\"exactExtractedMethodsSha256\":\"977523f550c0fff9597f0b180166f5ba60957df481187b4a730d354813c7c8b4\",\"methodBodiesCopiedWithoutReimplementation\":true,\"nativeUIExecuted\":false,\"SDKOrAPIExecuted\":false}".utf8)) as! [String: Any]
let output: [String: Any] = ["metadata": metadata, "cases": results, "passed": true,
                           "probeCount": results.count, "nativeAcceptanceClaim": false]
precondition(JSONSerialization.isValidJSONObject(output))
let data = try JSONSerialization.data(withJSONObject: output, options: [.prettyPrinted, .sortedKeys])
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write(Data("\n".utf8))
