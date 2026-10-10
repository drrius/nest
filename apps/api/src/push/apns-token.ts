import { createPrivateKey, sign } from "node:crypto";
import type { KeyObject } from "node:crypto";
import * as Redacted from "effect/Redacted";

export type ApnsCredentials = {
  keyId: string;
  teamId: string;
  privateKey: Redacted.Redacted<string>;
};

/** Keep this signer for the runtime's lifetime; never regenerate a JWT per send. */
export function apnsTokenSigner(credentials: ApnsCredentials, clock = () => Date.now()) {
  if (
    !/^[A-Z0-9]{10}$(?![\s\S])/.test(credentials.keyId) ||
    !/^[A-Z0-9]{10}$(?![\s\S])/.test(credentials.teamId)
  ) {
    throw new Error("Invalid APNs credentials");
  }
  const key = signingKey(credentials.privateKey);
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
    throw new Error("APNs requires a P-256 signing key");
  }
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: credentials.keyId })).toString(
    "base64url",
  );
  let cached: { issued: number; token: Redacted.Redacted<string> } | undefined;
  return () => {
    const seconds = Math.floor(clock() / 1000);
    if (!Number.isSafeInteger(seconds) || seconds < 0) throw new Error("Invalid APNs signing time");
    if (cached && seconds < cached.issued) throw new Error("APNs signing clock moved backwards");
    if (cached && seconds >= cached.issued && seconds - cached.issued < 1800) return cached.token;
    const claims = Buffer.from(JSON.stringify({ iss: credentials.teamId, iat: seconds })).toString(
      "base64url",
    );
    const message = `${header}.${claims}`;
    const signature = sign("sha256", Buffer.from(message), {
      key,
      dsaEncoding: "ieee-p1363",
    }).toString("base64url");
    cached = { issued: seconds, token: Redacted.make(`${message}.${signature}`) };
    return cached.token;
  };
}

function signingKey(value: Redacted.Redacted<string>): KeyObject {
  try {
    return createPrivateKey(Redacted.value(value));
  } catch {
    throw new Error("Invalid APNs signing key");
  }
}
