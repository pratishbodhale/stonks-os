export type UpstreamAiErrorInfo = {
  message: string;
  httpStatus: number;
};

const OVERLOAD_PATTERN =
  /high demand|try again|unavailable|overloaded|rate limit|resource exhausted|too many requests/i;

function parseNestedMessage(rawText: string): string | null {
  try {
    const parsed = JSON.parse(rawText) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof parsed.error === "object" && parsed.error?.message?.trim()) {
      return parsed.error.message.trim();
    }
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error.trim();
    }
    if (parsed.message?.trim()) {
      return parsed.message.trim();
    }
  } catch {
    // not JSON
  }
  return null;
}

function isTransientUpstreamFailure(status: number, message: string): boolean {
  return status === 429 || status === 503 || status === 504 || OVERLOAD_PATTERN.test(message);
}

export function formatUpstreamAiError(
  providerLabel: string,
  status: number,
  rawText: string,
): UpstreamAiErrorInfo {
  const upstreamMessage = parseNestedMessage(rawText);
  const message = upstreamMessage ?? `${providerLabel} request failed (${status})`;

  if (isTransientUpstreamFailure(status, message)) {
    return {
      message: `${providerLabel} is temporarily overloaded. Please try again in a minute.`,
      httpStatus: 503,
    };
  }

  return {
    message: upstreamMessage ? `${providerLabel}: ${upstreamMessage}` : message,
    httpStatus: 502,
  };
}

export function aiProviderHttpStatus(error: unknown): number {
  if (error instanceof Error && "httpStatus" in error) {
    const status = Number((error as Error & { httpStatus?: number }).httpStatus);
    if (Number.isFinite(status) && status >= 400) {
      return status;
    }
  }
  const message = error instanceof Error ? error.message : "";
  return message.includes("not configured") ? 503 : 502;
}

export async function readApiErrorMessage(response: Response): Promise<string> {
  let text = "";
  try {
    text = await response.text();
  } catch {
    return fallbackApiErrorMessage(response.status);
  }

  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed) as { error?: string };
      if (data.error?.trim()) {
        return data.error.trim();
      }
    } catch {
      // fall through
    }
  }

  return fallbackApiErrorMessage(response.status);
}

function fallbackApiErrorMessage(status: number): string {
  if (status === 429) {
    return "Too many requests. Please wait a moment and try again.";
  }
  if (status === 502 || status === 503 || status === 504) {
    return "The AI service is temporarily unavailable. Please try again in a minute.";
  }
  return `Request failed (${status})`;
}
