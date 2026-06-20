export async function POST(request) {
  const body = await request.json();

  const { name, surname, email, phone, city, interest } = body;

  if (!email || !email.includes('@')) {
    return Response.json({ error: 'Invalid email' }, { status: 400 });
  }

  const fields = { Email: email };
  if (name)     fields['First Name']   = name;
  if (surname)  fields['Last Name']    = surname;
  if (phone)    fields['Phone']        = phone;
  if (city)     fields['City']         = city;
  if (interest) fields['Notes']        = interest;

  const res = await fetch(
    `https://api.airtable.com/v0/appFkqvnXlu2Y1Fe4/tbl3NlUODD2Ztq3sl`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.AIRTABLE_PAT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: [{ fields }],
        typecast: true,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    return Response.json({ error: err }, { status: 500 });
  }

  return Response.json({ ok: true });
}
