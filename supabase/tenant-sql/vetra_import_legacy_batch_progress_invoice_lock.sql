CREATE OR REPLACE FUNCTION public.vetra_import_legacy_batch_progress(p_batch_id uuid, p_phase text, p_after_row bigint DEFAULT 0, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '55s'
AS $function$
DECLARE
  v_clinic_id uuid;
  v_batch public.legacy_import_batches%ROWTYPE;
  v_expected_count bigint;
  v_archive_count bigint;
  v_map_count bigint;

  v_row record;
  v_detail record;
  v_map record;

  v_name text;
  v_phone text;
  v_email text;
  v_address text;
  v_notes text;
  v_code text;
  v_candidate_name text;
  v_base_name text;
  v_suffix integer;
  v_parent_id_text text;
  v_parent_name text;
  v_category_id uuid;
  v_target_id uuid;
  v_client_id uuid;
  v_product_id uuid;
  v_invoice_id uuid;
  v_invoice_item_id uuid;
  v_new_invoice_number bigint;
  v_original_invoice_number bigint;
  v_original_invoice_number_text text;
  v_invoice_total numeric;
  v_paid numeric;
  v_quantity numeric;
  v_price numeric;
  v_final_price numeric;
  v_last_purchase numeric;
  v_unit_source text;
  v_original_invoice_numeric numeric;
  v_selected_sum numeric;
  v_sum_price_qty numeric;
  v_sum_final_qty numeric;
  v_sum_final_plain numeric;
  v_line_count bigint;
  v_bad_quantity bigint;
  v_bad_price bigint;
  v_bad_final_price bigint;
  v_unmapped_products bigint;
  v_price_matches boolean;
  v_final_matches boolean;
  v_final_plain_matches boolean;
  v_price_mode text;
  v_date timestamptz;
  v_existing_count bigint;
  v_max_target_invoice bigint;
  v_max_source_invoice bigint;
  v_next_invoice_number bigint;
  v_invoice_insert_attempts integer := 0;
  v_max_conflicting_invoice bigint;
  v_existing_client_id uuid;

  v_clients_imported bigint := 0;
  v_categories_imported bigint := 0;
  v_products_imported bigint := 0;
  v_invoices_imported bigint := 0;
  v_invoice_items_imported bigint := 0;
  v_invoices_held bigint := 0;
  v_unsupported_rows bigint := 0;
  v_pending_rows bigint := 0;
  v_result jsonb;
  v_invoice_max_row bigint := 0;
  v_progress_after bigint := 0;
  v_progress_done boolean := false;
BEGIN
  IF p_phase IS NULL OR p_phase NOT IN ('categories', 'clients', 'products', 'invoices', 'finalize') THEN
    RAISE EXCEPTION 'Invalid import progress phase: %', p_phase;
  END IF;
  IF p_after_row IS NULL OR p_after_row < 0 THEN
    RAISE EXCEPTION 'Invoice cursor must be zero or greater';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Import chunk limit must be between 1 and 100';
  END IF;

  v_clinic_id := public.vetra_current_clinic_id();
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'No active VETRA clinic found in JWT';
  END IF;

  -- Serialize invoice-number selection across every import batch for this clinic.
  PERFORM pg_advisory_xact_lock(hashtext(v_clinic_id::text), hashtext('vetra_import_legacy_batch_invoice_numbers'));

  SELECT *
    INTO v_batch
    FROM public.legacy_import_batches b
   WHERE b.id = p_batch_id
     AND b.clinic_id = v_clinic_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import batch was not found for the active clinic';
  END IF;

  IF v_batch.status IN ('committed', 'cancelled') THEN
    RAISE EXCEPTION 'This import batch is already %', v_batch.status;
  END IF;

  IF coalesce(v_batch.summary ->> 'archiveVerified', 'false') NOT IN ('true', 'TRUE') THEN
    RAISE EXCEPTION 'The source archive has not been verified';
  END IF;

  v_expected_count := public.vetra_legacy_try_numeric(
    coalesce(v_batch.summary ->> 'sourceRowsRead', v_batch.summary ->> 'sourcePayloadRowsStored')
  )::bigint;
  IF v_expected_count IS NULL OR v_expected_count <= 0 THEN
    RAISE EXCEPTION 'The archive summary does not contain a valid source row count';
  END IF;

  SELECT count(*) INTO v_archive_count
    FROM public.legacy_import_source_rows r
   WHERE r.batch_id = p_batch_id
     AND r.clinic_id = v_clinic_id;

  IF v_archive_count <> v_expected_count THEN
    RAISE EXCEPTION 'Archive count mismatch: expected %, found %', v_expected_count, v_archive_count;
  END IF;

  SELECT count(*) INTO v_map_count
    FROM public.legacy_import_id_map m
   WHERE m.batch_id = p_batch_id
     AND m.clinic_id = v_clinic_id;

  IF v_map_count <> v_archive_count THEN
    RAISE EXCEPTION 'Mapping count mismatch: archive has %, map has %', v_archive_count, v_map_count;
  END IF;

  SELECT coalesce(max(r.source_row_number), 0)
    INTO v_invoice_max_row
    FROM public.legacy_import_source_rows r
   WHERE r.batch_id = p_batch_id
     AND r.clinic_id = v_clinic_id
     AND r.source_table = 'SalesInvoices';

  IF p_phase = 'categories' THEN
  -- 1) Import top-level categories. Existing names are never merged automatically;
  --    a unique display name is generated for legacy data.
  FOR v_row IN
    SELECT r.*
      FROM public.legacy_import_source_rows r
      JOIN public.legacy_import_id_map m
        ON m.batch_id = r.batch_id AND m.source_table = r.source_table AND m.source_key = r.source_key
     WHERE r.batch_id = p_batch_id AND r.clinic_id = v_clinic_id
       AND r.source_table = 'Category'
       AND m.mapping_status <> 'imported'
     ORDER BY r.source_row_number
  LOOP
    v_name := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['name','categoryName','category_name'])), '');
    IF v_name IS NULL THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='اسم التصنيف غير موجود؛ تم الاحتفاظ بالسجل في الأرشيف.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      CONTINUE;
    END IF;

    v_base_name := left(v_name, 200);
    v_candidate_name := v_base_name;
    v_suffix := 1;
    WHILE EXISTS (
      SELECT 1 FROM public.product_categories c
       WHERE c.clinic_id = v_clinic_id AND lower(c.name) = lower(v_candidate_name)
    ) LOOP
      v_suffix := v_suffix + 1;
      v_candidate_name := left(v_base_name, 170) || ' (قديم ' || v_suffix::text || ')';
    END LOOP;

    INSERT INTO public.product_categories(name) VALUES (v_candidate_name) RETURNING id INTO v_target_id;
    UPDATE public.legacy_import_id_map
       SET target_table='product_categories', target_id=v_target_id,
           decision='create_new', mapping_status='imported', notes='تم استيراد التصنيف دون دمجه مع تصنيف موجود.', updated_at=now()
     WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
    v_categories_imported := v_categories_imported + 1;
  END LOOP;

  -- 2) Subcategories are represented as flat VETRA categories, with their parent in the label.
  FOR v_row IN
    SELECT r.*
      FROM public.legacy_import_source_rows r
      JOIN public.legacy_import_id_map m
        ON m.batch_id = r.batch_id AND m.source_table = r.source_table AND m.source_key = r.source_key
     WHERE r.batch_id = p_batch_id AND r.clinic_id = v_clinic_id
       AND r.source_table = 'Subcategory'
       AND m.mapping_status <> 'imported'
     ORDER BY r.source_row_number
  LOOP
    v_name := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['name','subcategoryName','subcategory_name'])), '');
    v_parent_id_text := public.vetra_legacy_json_text(v_row.payload, ARRAY['catId','categoryId','category_id','parentId','parent_id']);
    v_parent_name := NULL;
    v_category_id := NULL;

    IF v_parent_id_text IS NOT NULL THEN
      SELECT c.id, c.name
        INTO v_category_id, v_parent_name
        FROM public.legacy_import_source_rows sr
        JOIN public.legacy_import_id_map sm
          ON sm.batch_id=sr.batch_id AND sm.source_table=sr.source_table AND sm.source_key=sr.source_key
        JOIN public.product_categories c ON c.id=sm.target_id AND c.clinic_id=v_clinic_id
       WHERE sr.batch_id=p_batch_id AND sr.source_table='Category'
         AND public.vetra_legacy_json_text(sr.payload, ARRAY['id','categoryId','category_id']) = v_parent_id_text
         AND sm.target_table='product_categories' AND sm.mapping_status='imported'
       LIMIT 1;
    END IF;

    IF v_name IS NULL OR v_parent_name IS NULL THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='اسم التصنيف الفرعي أو التصنيف الأب غير واضح؛ السجل محفوظ للمراجعة.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      CONTINUE;
    END IF;

    v_base_name := left(v_parent_name || ' / ' || v_name, 200);
    v_candidate_name := v_base_name;
    v_suffix := 1;
    WHILE EXISTS (
      SELECT 1 FROM public.product_categories c
       WHERE c.clinic_id=v_clinic_id AND lower(c.name)=lower(v_candidate_name)
    ) LOOP
      v_suffix := v_suffix + 1;
      v_candidate_name := left(v_base_name, 165) || ' (قديم ' || v_suffix::text || ')';
    END LOOP;

    INSERT INTO public.product_categories(name) VALUES (v_candidate_name) RETURNING id INTO v_target_id;
    UPDATE public.legacy_import_id_map
       SET target_table='product_categories', target_id=v_target_id,
           decision='create_new', mapping_status='imported', notes='تم حفظ التصنيف الفرعي كتصنيف مستقل باسم يتضمن التصنيف الأب.', updated_at=now()
     WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
    v_categories_imported := v_categories_imported + 1;
  END LOOP;

  END IF;

  IF p_phase = 'clients' THEN
  -- 3) Clients. An exact existing name+phone is held for human review rather than merged.
  FOR v_row IN
    SELECT r.*
      FROM public.legacy_import_source_rows r
      JOIN public.legacy_import_id_map m
        ON m.batch_id=r.batch_id AND m.source_table=r.source_table AND m.source_key=r.source_key
     WHERE r.batch_id=p_batch_id AND r.clinic_id=v_clinic_id
       AND r.source_table='Customer' AND m.mapping_status <> 'imported'
     ORDER BY r.source_row_number
  LOOP
    v_name := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['name','customerName','customer_name'])), '');
    v_phone := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['phone','mobile','telephone'])), '');
    v_email := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['email','e_mail'])), '');
    v_address := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['address','customerAddress','customer_address'])), '');
    v_notes := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['notes','note','comment'])), '');
    v_code := public.vetra_legacy_json_text(v_row.payload, ARRAY['code','customerCode','customer_code']);

    IF v_name IS NULL THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='اسم العميل فارغ؛ لم يتم إنشاء عميل غير مكتمل.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      CONTINUE;
    END IF;

    v_existing_client_id := NULL;
    IF v_phone IS NOT NULL THEN
      SELECT c.id INTO v_existing_client_id
        FROM public.clients c
       WHERE c.clinic_id=v_clinic_id
         AND lower(regexp_replace(btrim(c.name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(v_name), '\s+', ' ', 'g'))
         AND regexp_replace(coalesce(c.phone,''), '\s+', '', 'g') = regexp_replace(v_phone, '\s+', '', 'g')
       LIMIT 1;
    END IF;

    IF v_existing_client_id IS NOT NULL THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='يوجد عميل حالي بالاسم والهاتف نفسيهما؛ لم يتم الدمج أو الربط تلقائيًا.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      CONTINUE;
    END IF;

    v_notes := concat_ws(E'\n', v_notes,
      'مستورد من قاعدة قديمة: ' || v_batch.source_file_name,
      CASE WHEN v_code IS NOT NULL THEN 'كود العميل الأصلي: ' || v_code ELSE NULL END,
      CASE WHEN public.vetra_legacy_json_text(v_row.payload, ARRAY['phone2','phone_2','mobile2']) IS NOT NULL
        THEN 'هاتف إضافي قديم: ' || public.vetra_legacy_json_text(v_row.payload, ARRAY['phone2','phone_2','mobile2']) ELSE NULL END);

    INSERT INTO public.clients(name, phone, email, address, notes, client_code)
    VALUES (
      v_name, v_phone, v_email, v_address, v_notes,
      'LEG-CUST-' || upper(substr(md5(v_row.source_key), 1, 16))
    ) RETURNING id INTO v_target_id;

    UPDATE public.legacy_import_id_map
       SET target_table='clients', target_id=v_target_id, decision='create_new', mapping_status='imported',
           notes='تم إنشاء عميل مستقل مع الاحتفاظ بالكود القديم في الملاحظات.', updated_at=now()
     WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
    v_clients_imported := v_clients_imported + 1;
  END LOOP;

  END IF;

  IF p_phase = 'products' THEN
  -- 4) Products. Quantity is intentionally zero until opening stock is reconciled.
  FOR v_row IN
    SELECT r.*
      FROM public.legacy_import_source_rows r
      JOIN public.legacy_import_id_map m
        ON m.batch_id=r.batch_id AND m.source_table=r.source_table AND m.source_key=r.source_key
     WHERE r.batch_id=p_batch_id AND r.clinic_id=v_clinic_id
       AND r.source_table='Product' AND m.mapping_status <> 'imported'
     ORDER BY r.source_row_number
  LOOP
    v_name := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['name','productName','product_name'])), '');
    v_price := public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_row.payload, ARRAY['buyPrice','buy_price','wholesale_price']));
    v_final_price := public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_row.payload, ARRAY['sellPrice','sell_price','retail_price']));
    v_last_purchase := public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_row.payload, ARRAY['lastBuyPrice','last_buy_price','last_purchase_price']));
    v_unit_source := public.vetra_legacy_json_text(v_row.payload, ARRAY['unit','unitName','unit_name']);
    v_notes := nullif(btrim(public.vetra_legacy_json_text(v_row.payload, ARRAY['notes','note','description'])), '');
    v_code := public.vetra_legacy_json_text(v_row.payload, ARRAY['code','productCode','product_code','barcode']);
    v_category_id := NULL;
    v_parent_id_text := public.vetra_legacy_json_text(v_row.payload, ARRAY['subcatId','subcategoryId','subcategory_id']);

    IF v_name IS NULL THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='اسم الصنف فارغ؛ لم يتم إنشاء صنف غير معروف.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      CONTINUE;
    END IF;
    IF (public.vetra_legacy_json_text(v_row.payload, ARRAY['buyPrice','buy_price','wholesale_price']) IS NOT NULL AND v_price IS NULL)
       OR (public.vetra_legacy_json_text(v_row.payload, ARRAY['sellPrice','sell_price','retail_price']) IS NOT NULL AND v_final_price IS NULL)
       OR (public.vetra_legacy_json_text(v_row.payload, ARRAY['lastBuyPrice','last_buy_price','last_purchase_price']) IS NOT NULL AND v_last_purchase IS NULL)
       OR v_price < 0 OR v_final_price < 0 OR v_last_purchase < 0 THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='سعر الشراء أو البيع غير صالح؛ تم ترك الصنف للأرشيف والمراجعة.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      CONTINUE;
    END IF;

    IF v_parent_id_text IS NOT NULL THEN
      SELECT sm.target_id INTO v_category_id
        FROM public.legacy_import_source_rows sr
        JOIN public.legacy_import_id_map sm
          ON sm.batch_id=sr.batch_id AND sm.source_table=sr.source_table AND sm.source_key=sr.source_key
       WHERE sr.batch_id=p_batch_id AND sr.source_table='Subcategory'
         AND public.vetra_legacy_json_text(sr.payload, ARRAY['id','subcategoryId','subcategory_id'])=v_parent_id_text
         AND sm.target_table='product_categories' AND sm.mapping_status='imported'
       LIMIT 1;
    END IF;
    IF v_category_id IS NULL THEN
      v_parent_id_text := public.vetra_legacy_json_text(v_row.payload, ARRAY['catId','categoryId','category_id']);
      IF v_parent_id_text IS NOT NULL THEN
        SELECT cm.target_id INTO v_category_id
          FROM public.legacy_import_source_rows sr
          JOIN public.legacy_import_id_map cm
            ON cm.batch_id=sr.batch_id AND cm.source_table=sr.source_table AND cm.source_key=sr.source_key
         WHERE sr.batch_id=p_batch_id AND sr.source_table='Category'
           AND public.vetra_legacy_json_text(sr.payload, ARRAY['id','categoryId','category_id'])=v_parent_id_text
           AND cm.target_table='product_categories' AND cm.mapping_status='imported'
         LIMIT 1;
      END IF;
    END IF;

    v_notes := concat_ws(E'\n', v_notes,
      'مستورد من قاعدة قديمة: ' || v_batch.source_file_name,
      CASE WHEN v_code IS NOT NULL THEN 'الكود الأصلي محفوظ وليس باركود VETRA: ' || v_code ELSE NULL END,
      CASE WHEN v_price IS NULL THEN 'سعر الشراء غير مسجل في المصدر؛ تم تركه صفرًا لحين المراجعة.' ELSE NULL END,
      CASE WHEN v_final_price IS NULL THEN 'سعر البيع غير مسجل في المصدر؛ تم تركه صفرًا لحين المراجعة.' ELSE NULL END,
      CASE WHEN v_last_purchase IS NULL THEN 'آخر سعر شراء غير مسجل في المصدر.' ELSE NULL END,
      CASE WHEN v_unit_source IS NOT NULL THEN 'قيمة الوحدة في المصدر: ' || v_unit_source ELSE NULL END,
      'رصيد الافتتاح لم يُنقل؛ كمية الصنف في VETRA تبدأ من صفر حتى مطابقة المخزون القديم.');

    INSERT INTO public.products(
      name, category_id, barcode, unit, quantity, wholesale_price, retail_price,
      last_purchase_price, expiry_date, reorder_level, notes
    ) VALUES (
      v_name,
      v_category_id,
      NULL,
      CASE WHEN v_unit_source IS NULL OR btrim(v_unit_source) = '' OR v_unit_source ~ '^[0-9]+$' THEN 'piece' ELSE left(v_unit_source, 100) END,
      0,
      coalesce(v_price, 0),
      coalesce(v_final_price, 0),
      coalesce(v_last_purchase, 0),
      public.vetra_legacy_try_date(public.vetra_legacy_json_text(v_row.payload, ARRAY['expDate','expiry_date','expiryDate'])),
      greatest(coalesce(public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_row.payload, ARRAY['miniQuantity','mini_quantity','reorder_level'])), 0), 0),
      v_notes
    ) RETURNING id INTO v_target_id;

    UPDATE public.legacy_import_id_map
       SET target_table='products', target_id=v_target_id, decision='create_new', mapping_status='imported',
           notes='تم إنشاء الصنف دون باركود قديم أو كمية مخزون غير مؤكدة.', updated_at=now()
     WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
    v_products_imported := v_products_imported + 1;
  END LOOP;

  END IF;

  IF p_phase = 'invoices' THEN
  -- 5) Import sales invoices only when the source number/customer/items/prices/total/payments
  --    can be interpreted without guessing. All invoice and line writes are in this transaction.
  SELECT coalesce(max(i.invoice_number), 0) INTO v_max_target_invoice
    FROM public.invoices i WHERE i.clinic_id=v_clinic_id;
  SELECT coalesce(max(
           CASE WHEN s.invoice_number_numeric > 0
                     AND s.invoice_number_numeric <= 9223372036854775807
                     AND s.invoice_number_numeric = trunc(s.invoice_number_numeric)
                THEN s.invoice_number_numeric::bigint ELSE NULL END
         ), 0)
    INTO v_max_source_invoice
    FROM (
      SELECT public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(r.payload, ARRAY['invoice_no','invoice_number','invoiceNo','invoiceNumber'])) AS invoice_number_numeric
        FROM public.legacy_import_source_rows r
       WHERE r.batch_id=p_batch_id AND r.clinic_id=v_clinic_id AND r.source_table='SalesInvoices'
    ) s;
  v_next_invoice_number := greatest(v_max_target_invoice, v_max_source_invoice) + 1;

  FOR v_row IN
    SELECT r.*
      FROM public.legacy_import_source_rows r
      JOIN public.legacy_import_id_map m
        ON m.batch_id=r.batch_id AND m.source_table=r.source_table AND m.source_key=r.source_key
     WHERE r.batch_id=p_batch_id AND r.clinic_id=v_clinic_id
       AND r.source_table='SalesInvoices' AND m.mapping_status <> 'imported'
       AND r.source_row_number > p_after_row
       AND r.source_row_number <= p_after_row + p_limit
     ORDER BY r.source_row_number
  LOOP
    v_original_invoice_number_text := public.vetra_legacy_json_text(v_row.payload, ARRAY['invoice_no','invoice_number','invoiceNo','invoiceNumber']);
    v_invoice_total := public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_row.payload, ARRAY['total','totalAmount','total_amount','netTotal']));
    v_original_invoice_numeric := public.vetra_legacy_try_numeric(v_original_invoice_number_text);
    v_original_invoice_number := NULL;
    v_client_id := NULL;
    v_invoice_id := NULL;

    IF v_original_invoice_number_text IS NULL OR v_original_invoice_numeric IS NULL
       OR v_original_invoice_numeric <= 0
       OR v_original_invoice_numeric <> trunc(v_original_invoice_numeric)
       OR v_original_invoice_numeric > 9223372036854775807 THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='رقم الفاتورة القديم ليس رقمًا صحيحًا موجبًا؛ تم الاحتفاظ بها للمراجعة.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      v_invoices_held := v_invoices_held + 1;
      CONTINUE;
    END IF;

    v_original_invoice_number := v_original_invoice_numeric::bigint;

    SELECT count(*) INTO v_existing_count
      FROM public.legacy_import_source_rows sr

     WHERE sr.batch_id=p_batch_id AND sr.source_table='SalesInvoices'
       AND public.vetra_legacy_json_text(sr.payload, ARRAY['invoice_no','invoice_number','invoiceNo','invoiceNumber'])=v_original_invoice_number_text;
    IF v_existing_count <> 1 THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='رقم الفاتورة مكرر داخل الملف القديم؛ لا يمكن التأكد من البنود التابعة لها.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      v_invoices_held := v_invoices_held + 1;
      CONTINUE;
    END IF;

    SELECT cm.target_id INTO v_client_id
      FROM public.legacy_import_source_rows cr
      JOIN public.legacy_import_id_map cm
        ON cm.batch_id=cr.batch_id AND cm.source_table=cr.source_table AND cm.source_key=cr.source_key
     WHERE cr.batch_id=p_batch_id AND cr.source_table='Customer'
       AND public.vetra_legacy_json_text(cr.payload, ARRAY['id','customerId','customer_id']) =
           public.vetra_legacy_json_text(v_row.payload, ARRAY['cust_id','customerId','customer_id','customer_id_fk'])
       AND cm.target_table='clients' AND cm.mapping_status='imported'
     LIMIT 1;

    IF v_client_id IS NULL THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='العميل المرتبط بالفاتورة لم يُنقل أو يحتاج مراجعة؛ الفاتورة محفوظة دون استيراد.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      v_invoices_held := v_invoices_held + 1;
      CONTINUE;
    END IF;

    SELECT
      count(*),
      count(*) FILTER (WHERE public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['quantity','qty'])) IS NULL OR public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['quantity','qty'])) <= 0),
      count(*) FILTER (WHERE public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['price','unit_price','unitPrice'])) IS NULL OR public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['price','unit_price','unitPrice'])) < 0),
      count(*) FILTER (WHERE public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['final_price','finalPrice','final_unit_price'])) IS NULL OR public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['final_price','finalPrice','final_unit_price'])) < 0),
      coalesce(sum(public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['price','unit_price','unitPrice'])) * public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['quantity','qty']))), 0),
      coalesce(sum(public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['final_price','finalPrice','final_unit_price'])) * public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['quantity','qty']))), 0),
      coalesce(sum(public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['final_price','finalPrice','final_unit_price']))), 0)
      INTO v_line_count, v_bad_quantity, v_bad_price, v_bad_final_price,
           v_sum_price_qty, v_sum_final_qty, v_sum_final_plain
      FROM public.legacy_import_source_rows d
     WHERE d.batch_id=p_batch_id AND d.clinic_id=v_clinic_id AND d.source_table='SalesInvoiceDetails'
       AND public.vetra_legacy_json_text(d.payload, ARRAY['invoice_id','invoiceNo','invoice_no','invoiceNumber'])=v_original_invoice_number_text;

    IF v_line_count = 0 OR v_bad_quantity > 0 OR (v_bad_price = v_line_count AND v_bad_final_price = v_line_count) THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='الفاتورة ليس لها بنود قابلة للاستيراد أو تحتوي كمية/سعرًا غير صالح؛ بقيت في الأرشيف.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      v_invoices_held := v_invoices_held + 1;
      CONTINUE;
    END IF;

    SELECT count(*) INTO v_unmapped_products
      FROM public.legacy_import_source_rows d
     WHERE d.batch_id=p_batch_id AND d.clinic_id=v_clinic_id AND d.source_table='SalesInvoiceDetails'
       AND public.vetra_legacy_json_text(d.payload, ARRAY['invoice_id','invoiceNo','invoice_no','invoiceNumber'])=v_original_invoice_number_text
       AND NOT EXISTS (
         SELECT 1
           FROM public.legacy_import_source_rows pr
           JOIN public.legacy_import_id_map pm
             ON pm.batch_id=pr.batch_id AND pm.source_table=pr.source_table AND pm.source_key=pr.source_key
          WHERE pr.batch_id=p_batch_id AND pr.source_table='Product'
            AND public.vetra_legacy_json_text(pr.payload, ARRAY['id','productId','product_id']) =
                public.vetra_legacy_json_text(d.payload, ARRAY['prod_id','productId','product_id'])
            AND pm.target_table='products' AND pm.mapping_status='imported'
       );
    IF v_unmapped_products > 0 THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='بعض أصناف الفاتورة لم تُنقل أو تحتاج مراجعة؛ الفاتورة وبنودها بقيت بالأرشيف.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      v_invoices_held := v_invoices_held + 1;
      CONTINUE;
    END IF;

    v_price_matches := v_bad_price = 0 AND abs(v_sum_price_qty - coalesce(v_invoice_total, -999999999)) <= 0.03;
    v_final_matches := v_bad_final_price = 0 AND abs(v_sum_final_qty - coalesce(v_invoice_total, -999999999)) <= 0.03;
    v_final_plain_matches := v_bad_final_price = 0 AND
      (SELECT count(*) = count(*) FILTER (WHERE public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(d.payload, ARRAY['quantity','qty'])) = 1)
         FROM public.legacy_import_source_rows d
        WHERE d.batch_id=p_batch_id AND d.source_table='SalesInvoiceDetails'
          AND public.vetra_legacy_json_text(d.payload, ARRAY['invoice_id','invoiceNo','invoice_no','invoiceNumber'])=v_original_invoice_number_text)
      AND abs(v_sum_final_plain - coalesce(v_invoice_total, -999999999)) <= 0.03;

    v_price_mode := NULL;
    IF v_invoice_total IS NOT NULL THEN
      IF v_price_matches AND (NOT v_final_matches OR abs(v_sum_price_qty - v_sum_final_qty) <= 0.03) THEN
        v_price_mode := 'price';
        v_selected_sum := v_sum_price_qty;
      ELSIF v_final_matches AND NOT v_price_matches THEN
        v_price_mode := 'final_price';
        v_selected_sum := v_sum_final_qty;
      ELSIF v_final_plain_matches AND NOT v_price_matches AND NOT v_final_matches THEN
        v_price_mode := 'final_price';
        v_selected_sum := v_sum_final_plain;
      END IF;
    END IF;

    IF v_price_mode IS NULL THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='إجمالي رأس الفاتورة لا يتطابق بشكل واضح مع أسعار البنود والكميات؛ لم يتم تعديل أي مبلغ.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      v_invoices_held := v_invoices_held + 1;
      CONTINUE;
    END IF;

    v_paid := public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_row.payload, ARRAY['paid','paidAmount','paid_amount']));
    IF v_paid IS NULL OR v_paid < 0 OR v_paid > v_invoice_total
       OR (v_paid = 1 AND v_invoice_total > 1) THEN
      UPDATE public.legacy_import_id_map SET decision='needs_review', mapping_status='pending', notes='قيمة المدفوع غير واضحة أو لا تتفق مع إجمالي الفاتورة؛ لم يتم تخمين حالة السداد.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;
      v_invoices_held := v_invoices_held + 1;
      CONTINUE;
    END IF;

    v_date := public.vetra_legacy_try_timestamptz(public.vetra_legacy_json_text(v_row.payload, ARRAY['date','invoiceDate','invoice_date','created_at']));
    v_notes := public.vetra_legacy_json_text(v_row.payload, ARRAY['notes','note','comment']);
    v_notes := concat_ws(E'\n', nullif(btrim(v_notes), ''),
      'مستورد من قاعدة قديمة: ' || v_batch.source_file_name,
      'رقم الفاتورة الأصلي: ' || v_original_invoice_number::text,
      'قيمة الإجمالي الأصلية: ' || v_invoice_total::text,
      CASE WHEN abs(v_selected_sum - v_invoice_total) > 0 THEN 'فرق تقريب بين مجموع البنود ورأس الفاتورة: ' || (v_invoice_total - v_selected_sum)::text ELSE NULL END);

    v_new_invoice_number := v_original_invoice_number;
    IF EXISTS (SELECT 1 FROM public.invoices i WHERE i.clinic_id=v_clinic_id AND i.invoice_number=v_original_invoice_number) THEN
      LOOP
        WHILE EXISTS (SELECT 1 FROM public.invoices i WHERE i.clinic_id=v_clinic_id AND i.invoice_number=v_next_invoice_number) LOOP
          v_next_invoice_number := v_next_invoice_number + 1;
        END LOOP;
        v_new_invoice_number := v_next_invoice_number;
        v_next_invoice_number := v_next_invoice_number + 1;
        EXIT;
      END LOOP;
    END IF;

    v_invoice_insert_attempts := 0;
    LOOP
      v_invoice_id := NULL;
      INSERT INTO public.invoices(
        invoice_number, client_id, status, payment_method, subtotal, discount,
        total, paid_amount, notes, issued_at, created_by, updated_by
      ) VALUES (
        v_new_invoice_number, v_client_id,
        CASE WHEN v_paid = v_invoice_total THEN 'paid'
             WHEN v_paid > 0 THEN 'partially_paid' ELSE 'unpaid' END,
        NULL,
        v_selected_sum,
        0,
        v_invoice_total,
        v_paid,
        v_notes,
        v_date,
        auth.uid(),
        auth.uid()
      ) ON CONFLICT (clinic_id, invoice_number) DO NOTHING
      RETURNING id INTO v_invoice_id;

      EXIT WHEN v_invoice_id IS NOT NULL;
      v_invoice_insert_attempts := v_invoice_insert_attempts + 1;
      IF v_invoice_insert_attempts > 20 THEN
        RAISE EXCEPTION 'Could not reserve a unique invoice number after 20 attempts';
      END IF;

      SELECT coalesce(max(i.invoice_number), 0) + 1
        INTO v_max_conflicting_invoice
        FROM public.invoices i
       WHERE i.clinic_id = v_clinic_id;
      v_new_invoice_number := greatest(v_next_invoice_number, v_max_conflicting_invoice);
      v_next_invoice_number := v_new_invoice_number + 1;
    END LOOP;

    UPDATE public.legacy_import_id_map
       SET target_table='invoices', target_id=v_invoice_id, decision='create_new', mapping_status='imported',
           notes=CASE WHEN v_new_invoice_number <> v_original_invoice_number
             THEN 'تم نقل الفاتورة برقم جديد لتفادي التعارض؛ الرقم الأصلي محفوظ في ملاحظات الفاتورة.'
             ELSE 'تم نقل الفاتورة بعد التحقق من إجمالي البنود.' END,
           updated_at=now()
     WHERE batch_id=p_batch_id AND source_table=v_row.source_table AND source_key=v_row.source_key;

    FOR v_detail IN
      SELECT d.*
        FROM public.legacy_import_source_rows d
       WHERE d.batch_id=p_batch_id AND d.clinic_id=v_clinic_id AND d.source_table='SalesInvoiceDetails'
         AND public.vetra_legacy_json_text(d.payload, ARRAY['invoice_id','invoiceNo','invoice_no','invoiceNumber'])=v_original_invoice_number_text
       ORDER BY d.source_row_number
    LOOP
      SELECT pm.target_id INTO v_product_id
        FROM public.legacy_import_source_rows pr
        JOIN public.legacy_import_id_map pm
          ON pm.batch_id=pr.batch_id AND pm.source_table=pr.source_table AND pm.source_key=pr.source_key
       WHERE pr.batch_id=p_batch_id AND pr.source_table='Product'
         AND public.vetra_legacy_json_text(pr.payload, ARRAY['id','productId','product_id']) =
             public.vetra_legacy_json_text(v_detail.payload, ARRAY['prod_id','productId','product_id'])
         AND pm.target_table='products' AND pm.mapping_status='imported'
       LIMIT 1;

      v_quantity := public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_detail.payload, ARRAY['quantity','qty']));
      IF v_price_mode = 'price' THEN
        v_price := public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_detail.payload, ARRAY['price','unit_price','unitPrice']));
      ELSE
        v_price := public.vetra_legacy_try_numeric(public.vetra_legacy_json_text(v_detail.payload, ARRAY['final_price','finalPrice','final_unit_price']));
      END IF;
      v_notes := public.vetra_legacy_json_text(v_detail.payload, ARRAY['prod_name','productName','product_name','description']);
      v_code := public.vetra_legacy_json_text(v_detail.payload, ARRAY['price','unit_price','unitPrice']);
      v_notes := concat_ws(E'\n', nullif(btrim(v_notes), ''),
        'سعر الوحدة الأصلي: ' || coalesce(v_code, 'غير مسجل'),
        'تم الاحتفاظ بوصف الصنف من الفاتورة القديمة.');

      INSERT INTO public.invoice_items(
        invoice_id, item_type, product_id, service_name, description,
        quantity, unit_price, discount, total
      ) VALUES (
        v_invoice_id, 'product', v_product_id, NULL, v_notes,
        v_quantity, v_price, 0, v_quantity * v_price
      ) RETURNING id INTO v_invoice_item_id;

      UPDATE public.legacy_import_id_map
         SET target_table='invoice_items', target_id=v_invoice_item_id,
             decision='create_new', mapping_status='imported', notes='تم نقل بند الفاتورة مع الاحتفاظ بوصف المصدر.', updated_at=now()
       WHERE batch_id=p_batch_id AND source_table='SalesInvoiceDetails' AND source_key=v_detail.source_key;
      v_invoice_items_imported := v_invoice_items_imported + 1;
    END LOOP;

    v_invoices_imported := v_invoices_imported + 1;
  END LOOP;

  END IF;

  IF p_phase <> 'finalize' THEN
    IF p_phase = 'invoices' THEN
      v_progress_after := least(p_after_row + p_limit, v_invoice_max_row);
      v_progress_done := v_progress_after >= v_invoice_max_row;
    ELSE
      v_progress_after := 0;
      v_progress_done := true;
    END IF;

    UPDATE public.legacy_import_batches
       SET summary = coalesce(summary, '{}'::jsonb) || jsonb_build_object(
         'lastImportProgress', jsonb_build_object(
           'phase', p_phase,
           'afterRow', v_progress_after,
           'limit', p_limit,
           'phaseDone', v_progress_done,
           'updatedAt', now()
         )
       ),
           updated_at = now()
     WHERE id = p_batch_id AND clinic_id = v_clinic_id;

    RETURN jsonb_build_object(
      'phase', p_phase,
      'afterRow', v_progress_after,
      'phaseDone', v_progress_done,
      'invoiceRowsTotal', v_invoice_max_row,
      'committedAt', now()
    );
  END IF;

  -- Final totals are recomputed from the durable mapping table, not per-call variables.
  SELECT count(*) INTO v_categories_imported
    FROM public.legacy_import_id_map m
   WHERE m.batch_id = p_batch_id AND m.clinic_id = v_clinic_id
     AND m.target_table = 'product_categories' AND m.mapping_status = 'imported';

  SELECT count(*) INTO v_clients_imported
    FROM public.legacy_import_id_map m
   WHERE m.batch_id = p_batch_id AND m.clinic_id = v_clinic_id
     AND m.target_table = 'clients' AND m.mapping_status = 'imported';

  SELECT count(*) INTO v_products_imported
    FROM public.legacy_import_id_map m
   WHERE m.batch_id = p_batch_id AND m.clinic_id = v_clinic_id
     AND m.target_table = 'products' AND m.mapping_status = 'imported';

  SELECT count(*) INTO v_invoices_imported
    FROM public.legacy_import_id_map m
   WHERE m.batch_id = p_batch_id AND m.clinic_id = v_clinic_id
     AND m.target_table = 'invoices' AND m.mapping_status = 'imported';

  SELECT count(*) INTO v_invoice_items_imported
    FROM public.legacy_import_id_map m
   WHERE m.batch_id = p_batch_id AND m.clinic_id = v_clinic_id
     AND m.target_table = 'invoice_items' AND m.mapping_status = 'imported';

  SELECT count(*) INTO v_invoices_held
    FROM public.legacy_import_id_map m
   WHERE m.batch_id = p_batch_id AND m.clinic_id = v_clinic_id
     AND m.source_table = 'SalesInvoices'
     AND m.mapping_status <> 'imported'
     AND m.decision = 'needs_review';

  SELECT count(*) INTO v_unsupported_rows
    FROM public.legacy_import_source_rows r
   WHERE r.batch_id=p_batch_id AND r.clinic_id=v_clinic_id
     AND r.source_table NOT IN ('Customer','Category','Subcategory','Product','SalesInvoices','SalesInvoiceDetails');

  SELECT count(*) INTO v_pending_rows
    FROM public.legacy_import_id_map m
   WHERE m.batch_id=p_batch_id AND m.clinic_id=v_clinic_id
     AND m.mapping_status <> 'imported';

  v_result := jsonb_build_object(
    'batchId', p_batch_id,
    'clientsImported', v_clients_imported,
    'categoriesImported', v_categories_imported,
    'productsImported', v_products_imported,
    'invoicesImported', v_invoices_imported,
    'invoiceItemsImported', v_invoice_items_imported,
    'invoicesHeldForReview', v_invoices_held,
    'unsupportedRowsPreserved', v_unsupported_rows,
    'pendingRows', v_pending_rows,
    'archiveRowsVerified', v_archive_count,
    'mappingRowsVerified', v_map_count,
    'businessTablesModified', (v_clients_imported + v_categories_imported + v_products_imported + v_invoices_imported + v_invoice_items_imported) > 0,
    'completedAt', now()
  );

  UPDATE public.legacy_import_batches
     SET status='needs_review',
         summary=coalesce(summary, '{}'::jsonb) || jsonb_build_object(
           'lastImportRun', v_result,
           'lastImportRunAt', now(),
         'lastImportProgress', jsonb_build_object('phase', 'complete', 'afterRow', v_invoice_max_row, 'phaseDone', true, 'updatedAt', now()),
           'businessDataWritten', (coalesce((summary ->> 'businessDataWritten')::boolean, false) OR (v_clients_imported + v_categories_imported + v_products_imported + v_invoices_imported + v_invoice_items_imported) > 0)
         ),
         updated_at=now()
   WHERE id=p_batch_id AND clinic_id=v_clinic_id;

  RETURN v_result;
END;
$function$

