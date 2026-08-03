import Foundation
import Security

enum KeychainFailure: Error {
    case invalidArguments
    case emptySecret
    case osStatus(OSStatus)
}

func query(service: String, account: String) -> [CFString: Any] {
    [
        kSecClass: kSecClassGenericPassword,
        kSecAttrService: service,
        kSecAttrAccount: account,
    ]
}

func setSecret(service: String, account: String) throws {
    let secret = FileHandle.standardInput.readDataToEndOfFile()
    guard !secret.isEmpty else { throw KeychainFailure.emptySecret }

    let match = query(service: service, account: account)
    let updated = SecItemUpdate(
        match as CFDictionary,
        [kSecValueData: secret] as CFDictionary
    )
    if updated == errSecSuccess { return }
    guard updated == errSecItemNotFound else { throw KeychainFailure.osStatus(updated) }

    var item = match
    item[kSecValueData] = secret
    item[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let added = SecItemAdd(item as CFDictionary, nil)
    guard added == errSecSuccess else { throw KeychainFailure.osStatus(added) }
}

func getSecret(service: String, account: String) throws {
    var match = query(service: service, account: account)
    match[kSecReturnData] = true
    match[kSecMatchLimit] = kSecMatchLimitOne

    var result: CFTypeRef?
    let status = SecItemCopyMatching(match as CFDictionary, &result)
    guard status == errSecSuccess, let data = result as? Data else {
        throw KeychainFailure.osStatus(status)
    }
    try FileHandle.standardOutput.write(contentsOf: data)
}

do {
    let arguments = CommandLine.arguments
    guard arguments.count == 4 else { throw KeychainFailure.invalidArguments }
    let operation = arguments[1]
    let service = arguments[2]
    let account = arguments[3]
    guard !service.isEmpty, !account.isEmpty else { throw KeychainFailure.invalidArguments }

    switch operation {
    case "set": try setSecret(service: service, account: account)
    case "get": try getSecret(service: service, account: account)
    default: throw KeychainFailure.invalidArguments
    }
} catch KeychainFailure.invalidArguments {
    FileHandle.standardError.write(Data("usage: keychain-secret.swift <set|get> <service> <account>\n".utf8))
    exit(64)
} catch KeychainFailure.emptySecret {
    FileHandle.standardError.write(Data("secret input is empty\n".utf8))
    exit(65)
} catch KeychainFailure.osStatus(let status) {
    FileHandle.standardError.write(Data("Keychain operation failed (status \(status))\n".utf8))
    exit(1)
} catch {
    FileHandle.standardError.write(Data("Keychain operation failed\n".utf8))
    exit(1)
}
