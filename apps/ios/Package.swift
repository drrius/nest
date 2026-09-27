// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "NestCore",
    platforms: [.iOS(.v18), .macOS(.v14)],
    products: [.library(name: "NestCore", targets: ["NestCore"])],
    targets: [
        .target(name: "NestCore", path: "Nest/Core", linkerSettings: [.linkedLibrary("sqlite3")]),
        .testTarget(name: "NestCoreTests", dependencies: ["NestCore"], path: "Tests/Core")
    ]
)
