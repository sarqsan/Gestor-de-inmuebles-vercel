import { SolicitudSeguroImpago, DocumentoAdjuntoSeguro } from '../types';

/**
 * Builds RFC 2822 MIME formatted message for Gmail API (including multipart attachments)
 */
export function buildRawEmailWithAttachments({
  to,
  subject,
  bodyText,
  attachments = [],
}: {
  to: string;
  subject: string;
  bodyText: string;
  attachments?: {
    filename: string;
    mimeType: string;
    base64Data: string;
  }[];
}): string {
  const boundary = `====_NextPart_${Date.now()}_${Math.random().toString(36).substring(2, 9)}====`;
  
  const utf8Subject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;

  let emailLines: string[] = [
    `To: ${to}`,
    `Subject: ${utf8Subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    bodyText,
    '',
  ];

  for (const att of attachments) {
    let cleanBase64 = att.base64Data;
    if (cleanBase64.includes(';base64,')) {
      cleanBase64 = cleanBase64.split(';base64,')[1];
    }
    // Remove newlines from base64 if present
    cleanBase64 = cleanBase64.replace(/[\r\n\s]/g, '');

    const utf8FileName = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(att.filename)))}?=`;

    emailLines.push(
      `--${boundary}`,
      `Content-Type: ${att.mimeType || 'application/pdf'}; name="${utf8FileName}"`,
      `Content-Disposition: attachment; filename="${utf8FileName}"`,
      'Content-Transfer-Encoding: base64',
      '',
      cleanBase64,
      ''
    );
  }

  emailLines.push(`--${boundary}--`);

  const fullEmailString = emailLines.join('\r\n');

  // Convert to URL-safe Base64 as required by Gmail API
  const bytes = new TextEncoder().encode(fullEmailString);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Sends an email via Gmail REST API on behalf of the authenticated user
 */
export async function sendGmailMessage(
  accessToken: string,
  rawBase64Url: string
): Promise<{ id: string; threadId: string }> {
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: rawBase64Url,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `Error al enviar correo vía Gmail (${response.status})`
    );
  }

  return await response.json();
}

/**
 * Lists recent messages matching a specific search query (e.g. Reference ID or insurer address)
 * Scoped strictly to insurance queries to protect user privacy.
 */
export async function searchGmailMessages(
  accessToken: string,
  query: string
): Promise<{ id: string; threadId: string }[]> {
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', '15');

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `Error al consultar mensajes en Gmail (${response.status})`
    );
  }

  const data = await response.json();
  return data.messages || [];
}

/**
 * Retrieves full details of a specific Gmail message (Subject, From, Date, Plain Text Body, Attachments)
 */
export async function getGmailMessageDetails(
  accessToken: string,
  messageId: string
): Promise<{
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  body: string;
  snippet: string;
  attachments: { filename: string; mimeType: string; attachmentId: string; size: number }[];
}> {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `Error al leer mensaje ${messageId} (${response.status})`
    );
  }

  const msg = await response.json();
  const headers = msg.payload?.headers || [];

  const getHeader = (name: string) =>
    headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

  const subject = getHeader('Subject');
  const from = getHeader('From');
  const date = getHeader('Date');

  let extractedBody = '';
  const attachments: { filename: string; mimeType: string; attachmentId: string; size: number }[] = [];

  const extractParts = (part: any) => {
    if (!part) return;

    if (part.body?.data && (part.mimeType === 'text/plain' || part.mimeType === 'text/html')) {
      try {
        const decoded = decodeBase64Url(part.body.data);
        if (part.mimeType === 'text/plain' && !extractedBody) {
          extractedBody = decoded;
        } else if (!extractedBody && part.mimeType === 'text/html') {
          // Strip HTML tags for clean text reading
          const tmp = decoded.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                             .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                             .replace(/<[^>]+>/g, ' ')
                             .replace(/\s+/g, ' ')
                             .trim();
          extractedBody = tmp;
        }
      } catch (e) {
        console.warn('Error decodificando parte de correo:', e);
      }
    }

    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType || 'application/octet-stream',
        attachmentId: part.body.attachmentId,
        size: part.body.size || 0,
      });
    }

    if (part.parts && Array.isArray(part.parts)) {
      part.parts.forEach(extractParts);
    }
  };

  extractParts(msg.payload);

  if (!extractedBody) {
    extractedBody = msg.snippet || '';
  }

  return {
    id: msg.id,
    threadId: msg.threadId,
    subject,
    from,
    date,
    body: extractedBody,
    snippet: msg.snippet || '',
    attachments,
  };
}

/**
 * Decodes Gmail URL-safe Base64 string to standard UTF-8 string
 */
function decodeBase64Url(input: string): string {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}
