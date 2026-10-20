-- Run on the clinic tenant database (not VETRA CORE).
-- Repairs the invoice_number identity/serial sequence after explicit legacy imports.
-- It does not change any invoice rows.

DO $repair_invoice_number_sequence$
DECLARE
  v_sequence_name text;
  v_sequence regclass;
  v_max_invoice_number bigint;
  v_sequence_last_value bigint;
  v_sequence_is_called boolean;
  v_next_value bigint;
BEGIN
  -- Prevent a new invoice from being issued while the sequence is being synchronized.
  LOCK TABLE public.invoices IN ACCESS EXCLUSIVE MODE;

  v_sequence_name := pg_get_serial_sequence('public.invoices', 'invoice_number');
  IF v_sequence_name IS NULL THEN
    RAISE EXCEPTION 'public.invoices.invoice_number has no identity/serial sequence; no change was made';
  END IF;
  v_sequence := v_sequence_name::regclass;

  SELECT coalesce(max(invoice_number), 0)::bigint
    INTO v_max_invoice_number
    FROM public.invoices;

  EXECUTE format('SELECT last_value, is_called FROM %s', v_sequence)
    INTO v_sequence_last_value, v_sequence_is_called;

  v_next_value := greatest(
    v_max_invoice_number + 1,
    v_sequence_last_value + CASE WHEN v_sequence_is_called THEN 1 ELSE 0 END
  );

  PERFORM setval(v_sequence, v_next_value, false);
  RAISE NOTICE 'Invoice number sequence synchronized. Next number will be %.', v_next_value;
END;
$repair_invoice_number_sequence$;
