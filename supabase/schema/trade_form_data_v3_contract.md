# TradeFormData schema version 3

`public.trades.form_data` and `public.trade_drafts.form_data` share this
contract. Application mappers will adopt it in Stage 3; the Stage 2 migration
only provides the storage envelope.

## Top-level shape

```json
{
  "schemaVersion": 3,
  "direction": "export",
  "role": "shipper",
  "parties": {},
  "items": [],
  "terms": {},
  "shipment": {},
  "packaging": {},
  "attachments": []
}
```

- `schemaVersion`: integer `3`
- `direction`: `export` or `import`; it must agree with the relational column
- `role`: `shipper` or `forwarder`; it must agree with the relational column
- `parties`: structured shipper, consignee, buyer, seller, notify-party, and
  forwarder data as applicable
- `items`: array of line-item objects; multi-item trades never flatten item
  fields into the top level
- `terms`: trade, payment, currency, Incoterm, and amount inputs
- `shipment`: ports, places, carrier, vessel/voyage, dates, and transport data
- `packaging`: package counts, types, marks, dimensions, weights, and volumes
- `attachments`: array of persisted storage metadata objects

Do not mix legacy flat `TradeProfile` keys into the top level. Do not store
browser `File` objects, UI synchronization flags, or transient
`loading`/`generating`/`submitting` state. Avoid duplicating values that can be
reliably calculated.

## Attachment metadata

```json
{
  "id": "application-generated-id",
  "documentType": "commercial_invoice",
  "fileName": "invoice.pdf",
  "storageBucket": "trade-documents",
  "storagePath": "user-id/trade-id/invoice.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 12345,
  "uploadedAt": "2026-07-30T00:00:00Z"
}
```

Allowed document types must distinguish at least:

- `commercial_invoice`
- `packing_list`
- `bill_of_lading`
- `certificate_of_origin`
- `arrival_notice`
- `other`

`arrival_notice` is independent from the other import documents. No redundant
`stage` key or arrival-notice boolean is stored. Import-forwarder completion
will be calculated in application code from an attachment whose
`documentType` is `arrival_notice` and whose `storagePath` is valid. An `other`
attachment never satisfies that condition.

`workflow_data` may contain durable workflow output that does not belong in
the shared form contract, but it must not contain transient React loading
state. Generated document payloads belong in `document_data`; attachment
metadata belongs in `form_data.attachments`.
