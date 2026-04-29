// Returns the available options of the "Role" multiple-select field
// from the Contacts table in Airtable.
//
// This lets the frontend build the contact-type filter buttons dynamically,
// so when Diego adds, renames or removes options in Airtable, the email
// composer reflects the change without any code edit.

const AIRTABLE_BASE_ID  = 'appFkqvnXlu2Y1Fe4';
const AIRTABLE_TABLE_ID = 'tbl3NlUODD2Ztq3sl';
const ROLE_FIELD_NAME   = 'Role';

export async function GET() {
  try {
    const res = await fetch(
      `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`,
      {
        headers: {
          Authorization: `Bearer ${process.env.AIRTABLE_PAT}`,
        },
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return Response.json(
        { error: `Airtable schema fetch failed: ${errText}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const table = data.tables?.find((t) => t.id === AIRTABLE_TABLE_ID);
    if (!table) {
      return Response.json(
        { error: `Table ${AIRTABLE_TABLE_ID} not found in base` },
        { status: 404 }
      );
    }

    // Role can be either singleSelect or multipleSelects in Airtable
    const roleField = table.fields?.find(
      (f) => f.name === ROLE_FIELD_NAME &&
             (f.type === 'multipleSelects' || f.type === 'singleSelect')
    );
    if (!roleField) {
      return Response.json(
        { error: `Select field "${ROLE_FIELD_NAME}" not found in table` },
        { status: 404 }
      );
    }

    const options = roleField.options?.choices?.map((c) => c.name) || [];
    return Response.json({ options });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
