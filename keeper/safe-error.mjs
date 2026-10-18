// Operational logs must not include RPC URL credentials, bearer tokens or signing keys.
export function safeError(error){
 const message=typeof error?.shortMessage==="string"?error.shortMessage:typeof error?.message==="string"?error.message:"Operation failed";
 return message.replace(/https?:\/\/[^\s"'<>]+/gi,"[service URL]")
  .replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]+|vcp_[A-Za-z0-9]{20,})\b/g,"[redacted token]")
  .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi,"[redacted authorization]")
  .replace(/\b(?:0x)?[a-fA-F0-9]{64}\b/g,"[redacted hex]").slice(0,600);
}
