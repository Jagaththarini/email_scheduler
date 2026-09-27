
export async function sendSlackMessage(text: string) {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;

  if (!token || !channel) {
    throw new Error("Slack token or channel ID is missing");
  }

  const response = await fetch(
    "https://slack.com/api/chat.postMessage",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        text,
      }),
    }
  );

  const data = await response.json() as {
    ok: boolean;
    error?: string;
  };

  if (!data.ok) {
    throw new Error(data.error || "Slack message failed");
  }

  return data;
}