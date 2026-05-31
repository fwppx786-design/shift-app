export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { message } = req.body
  const token = process.env.VITE_LINE_CHANNEL_ACCESS_TOKEN

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/broadcast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: [{ type: 'text', text: message }]
      })
    })
    const data = await response.json()
    res.status(200).json(data)
  } catch(e) {
    res.status(500).json({ error: e.message })
  }
}
