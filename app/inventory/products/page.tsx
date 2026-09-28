



















"use client";






import { useEffect, useMemo, useRef, useState } from "react";


import { BrowserMultiFormatReader } from "@zxing/browser";


import { supabase } from "@/lib/supabase";






type Category = {


  id: string;


  name: string;


};






type Product = {


  id: string;


  name: string;


  category_id: string | null;


  barcode: string | null;


  unit: string;


  quantity: number;


  wholesale_price: number;


  retail_price: number;


  last_purchase_price: number;




  expiry_date: string | null;


  reorder_level: number;


  notes: string | null;


  category?: {


    name: string;


  } | null;


};






const emptyProduct = {


  name: "",


  category_id: "",


  barcode: "",


  unit: "piece",


  quantity: "0",


  wholesale_price: "",


  retail_price: "",


  last_purchase_price: "",




  expiry_date: "",


  reorder_level: "0",


  notes: "",


};






export default function ProductsPage() {


  const [products, setProducts] = useState<Product[]>([]);


  const [categories, setCategories] = useState<Category[]>([]);






  const [search, setSearch] = useState("");


  const [selectedCategory, setSelectedCategory] =


    useState("all");






  const [showProductModal, setShowProductModal] =


    useState(false);






  const [showCategoryModal, setShowCategoryModal] =


    useState(false);






  const [showBarcodeScanner, setShowBarcodeScanner] =


    useState(false);






  const [editingProduct, setEditingProduct] =


    useState<Product | null>(null);






  const [productForm, setProductForm] =


    useState(emptyProduct);






  const [categoryName, setCategoryName] =


    useState("");


  const [showInlineCategory, setShowInlineCategory] =


    useState(false);


  const [inlineCategoryName, setInlineCategoryName] =


    useState("");






  const [loading, setLoading] = useState(true);


  const [saving, setSaving] = useState(false);


  const [message, setMessage] = useState("");






  useEffect(() => {


    loadData();


  }, []);






  async function loadData() {


    setLoading(true);






    const [productsResult, categoriesResult] =


      await Promise.all([


        supabase


          .from("products")


          .select(`


            *,


            category:product_categories (


              name


            )


          `)


          .order("created_at", {


            ascending: false,


          }),






        supabase


          .from("product_categories")


          .select("*")


          .order("name"),


      ]);






    if (productsResult.error) {


      console.error(productsResult.error);


      setMessage(


        "حصل خطأ أثناء تحميل المنتجات"


      );


    } else {


      setProducts(


        productsResult.data || []


      );


    }






    if (categoriesResult.error) {


      console.error(categoriesResult.error);


    } else {


      setCategories(


        categoriesResult.data || []


      );


    }






    setLoading(false);


  }






  function openAddProduct() {


    setEditingProduct(null);


    setProductForm(emptyProduct);


    setMessage("");


    setShowBarcodeScanner(false);


    setShowProductModal(true);


  }






  function openEditProduct(


    product: Product


  ) {


    setEditingProduct(product);






    setProductForm({


      name: product.name || "",


      category_id:


        product.category_id || "",


      barcode:


        product.barcode || "",


      unit:


        product.unit || "piece",


      quantity:


        String(product.quantity ?? 0),


      wholesale_price:


        String(


          product.wholesale_price ?? ""


        ),


      retail_price:


        String(


          product.retail_price ?? ""


        ),


      last_purchase_price:


        String(


          product.last_purchase_price ?? ""


        ),


      expiry_date:


        product.expiry_date || "",


      reorder_level:


        String(


          product.reorder_level ?? 0


        ),


      notes:


        product.notes || "",


    });






    setMessage("");


    setShowBarcodeScanner(false);


    setShowProductModal(true);


  }






  async function saveProduct() {


    if (!productForm.name.trim()) {


      setMessage(


        "اكتب اسم المنتج أولاً"


      );


      return;


    }






    setSaving(true);


    setMessage("");






    const payload = {


      name: productForm.name.trim(),






      category_id:


        productForm.category_id ||


        null,






      barcode:


        productForm.barcode.trim() ||


        null,






      unit:


        productForm.unit,






      quantity:


        Number(productForm.quantity) || 0,






      wholesale_price:


        Number(


          productForm.wholesale_price


        ) || 0,






      retail_price:


        Number(


          productForm.retail_price


        ) || 0,






      last_purchase_price:


        Number(


          productForm.last_purchase_price


        ) || 0,






      expiry_date:


        productForm.expiry_date ||


        null,






      reorder_level:


        Number(


          productForm.reorder_level


        ) || 0,






      notes:


        productForm.notes.trim() ||


        null,


    };






    let error;






    if (editingProduct) {


      const result =


        await supabase


          .from("products")


          .update(payload)


          .eq(


            "id",


            editingProduct.id


          );






      error = result.error;


    } else {


      const result =


        await supabase


          .from("products")


          .insert(payload);






      error = result.error;


    }






    if (error) {


      console.error(error);






      if (


        error.code === "23505"


      ) {


        setMessage(


          "الباركود ده موجود بالفعل لمنتج آخر"


        );


      } else {


        setMessage(


          error.message ||


            "حصل خطأ أثناء حفظ المنتج"


        );


      }






      setSaving(false);


      return;


    }






    setShowProductModal(false);


    setShowBarcodeScanner(false);


    setEditingProduct(null);


    setProductForm(emptyProduct);






    await loadData();






    setSaving(false);


  }






  async function addCategoryInsideProduct() {
    const name = inlineCategoryName.trim();

    if (!name) {
      setMessage("اكتب اسم التصنيف أولاً");
      return;
    }

    setSaving(true);
    setMessage("");

    const { data, error } = await supabase
      .from("product_categories")
      .insert({ name })
      .select("id, name")
      .single();

    if (error) {
      if (error.code === "23505") {
        const { data: existing } = await supabase
          .from("product_categories")
          .select("id, name")
          .eq("name", name)
          .maybeSingle();

        if (existing) {
          setCategories((current) => {
            const exists = current.some(
              (category) => category.id === existing.id
            );

            return exists
              ? current
              : [...current, existing].sort((a, b) =>
                  a.name.localeCompare(b.name)
                );
          });

          setProductForm((current) => ({
            ...current,
            category_id: existing.id,
          }));

          setInlineCategoryName("");
          setShowInlineCategory(false);
          setSaving(false);
          return;
        }
      }

      setMessage(
        error.message || "حصل خطأ أثناء إضافة التصنيف"
      );
      setSaving(false);
      return;
    }

    if (data) {
      setCategories((current) =>
        [...current, data].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );

      setProductForm((current) => ({
        ...current,
        category_id: data.id,
      }));
    }

    setInlineCategoryName("");
    setShowInlineCategory(false);
    setSaving(false);
  }

  async function deleteProduct(product: Product) {
    const confirmed = window.confirm(
      `هل أنت متأكد إنك عايز تحذف "${product.name}"؟\n\nالحذف نهائي من قائمة المنتجات.`
    );

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setMessage("");

    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", product.id);

    if (error) {
      console.error(error);
      setMessage(
        error.message || "حصل خطأ أثناء حذف المنتج"
      );
      setSaving(false);
      return;
    }

    await loadData();
    setSaving(false);
  }

  async function addCategory() {


    const name =


      categoryName.trim();






    if (!name) {


      return;


    }






    setSaving(true);


    setMessage("");






    const { error } =


      await supabase


        .from("product_categories")


        .insert({


          name,


        });






    if (error) {


      if (


        error.code === "23505"


      ) {


        setMessage(


          "التصنيف ده موجود بالفعل"


        );


      } else {


        setMessage(


          error.message ||


            "حصل خطأ أثناء إضافة التصنيف"


        );


      }






      setSaving(false);


      return;


    }






    setCategoryName("");


    setShowCategoryModal(false);






    await loadData();






    setSaving(false);


  }






  const filteredProducts =


    useMemo(() => {


      const q =


        search


          .trim()


          .toLowerCase();






      return products.filter(


        (product) => {


          const matchesSearch =


            !q ||


            product.name


              .toLowerCase()


              .includes(q) ||


            (


              product.barcode ||


              ""


            )


              .toLowerCase()


              .includes(q);






          const matchesCategory =


            selectedCategory ===


              "all" ||


            product.category_id ===


              selectedCategory;






          return (


            matchesSearch &&


            matchesCategory


          );


        }


      );


    }, [


      products,


      search,


      selectedCategory,


    ]);






  function formatPrice(


    value: number


  ) {


    return `${Number(


      value || 0


    ).toLocaleString(


      "en-US"


    )} ج`;


  }






  function formatExpiry(


    date: string | null


  ) {


    if (!date) {


      return "—";


    }






    const d =


      new Date(date);






    return d.toLocaleDateString(


      "en-GB"


    );


  }






  return (


    <main


      dir="rtl"


      className="min-h-screen bg-gray-50 p-6 text-gray-900 dark:bg-gray-950 dark:text-white"


    >


      <div className="mx-auto max-w-7xl">






        {/* HEADER */}


        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">






          <div>


            <h1 className="text-3xl font-bold">


              المنتجات


            </h1>






            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">


              إدارة المنتجات والأسعار والكميات والصلاحية


            </p>


          </div>






          <div className="flex flex-wrap gap-3">






            <button


              onClick={() => {


                setMessage("");


                setShowCategoryModal(


                  true


                );


              }}


              className="rounded-xl border border-gray-200 bg-white px-4 py-3 font-semibold shadow-sm transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"


            >


              + إضافة تصنيف


            </button>






            <button


              onClick={


                openAddProduct


              }


              className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-700"


            >


              + إضافة صنف جديد


            </button>






          </div>


        </div>






        {/* FILTERS */}


        <div className="mb-5 grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_220px] dark:border-gray-800 dark:bg-gray-900">






          <input


            value={search}


            onChange={(e) =>


              setSearch(


                e.target.value


              )


            }


            placeholder="🔎 ابحث باسم المنتج أو الباركود..."


            className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950"


          />






          <select


            value={


              selectedCategory


            }


            onChange={(e) =>


              setSelectedCategory(


                e.target.value


              )


            }


            className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none dark:border-gray-700 dark:bg-gray-950"


          >


            <option value="all">


              كل التصنيفات


            </option>






            {categories.map(


              (category) => (


                <option


                  key={


                    category.id


                  }


                  value={


                    category.id


                  }


                >


                  {category.name}


                </option>


              )


            )}


          </select>






        </div>






        {/* MESSAGE */}


        {message && (


          <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">


            {message}


          </div>


        )}






        {/* PRODUCTS TABLE */}


        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">






          <div className="overflow-x-auto">






            <table className="w-full min-w-[1200px] text-sm">






              <thead className="bg-gray-50 dark:bg-gray-800/60">


                <tr className="text-right">






                  <th className="px-4 py-4">


                    المنتج


                  </th>






                  <th className="px-4 py-4">


                    التصنيف


                  </th>






                  <th className="px-4 py-4">


                    الباركود


                  </th>






                  <th className="px-4 py-4">


                    الكمية


                  </th>






                  <th className="px-4 py-4">


                    سعر الجمهور


                  </th>






                  <th className="px-4 py-4">


                    سعر الجملة


                  </th>






                  <th className="px-4 py-4">


                    آخر سعر شراء


                  </th>
<th className="px-4 py-4">


                    الصلاحية


                  </th>






                  <th className="px-4 py-4">


                    إجراءات


                  </th>






                </tr>


              </thead>






              <tbody>






                {loading ? (


                  <tr>


                    <td


                      colSpan={9}


                      className="px-4 py-12 text-center text-gray-500"


                    >


                      جاري تحميل المنتجات...


                    </td>


                  </tr>


                ) : filteredProducts.length === 0 ? (


                  <tr>


                    <td


                      colSpan={9}


                      className="px-4 py-12 text-center text-gray-500"


                    >


                      مفيش منتجات مضافة لسه


                    </td>


                  </tr>


                ) : (


                  filteredProducts.map(


                    (product) => (


                      <tr


                        key={


                          product.id


                        }


                        className={`border-t border-gray-100 transition hover:bg-blue-50 dark:border-gray-800 dark:hover:bg-gray-800/60 ${
                          filteredProducts.indexOf(product) % 2 === 0
                            ? "bg-white dark:bg-gray-900"
                            : "bg-gray-50 dark:bg-gray-900/60"
                        }`}


                      >






                        <td className="px-4 py-4 font-semibold">


                          {


                            product.name


                          }


                        </td>






                        <td className="px-4 py-4">


                          {


                            product


                              .category


                              ?.name ||


                            "بدون تصنيف"


                          }


                        </td>






                        <td className="px-4 py-4 font-mono text-xs">


                          {


                            product.barcode ||


                            "—"


                          }


                        </td>






                        <td className="px-4 py-4">


                          <span


                            className={


                              Number(


                                product.quantity


                              ) <=


                              Number(


                                product.reorder_level


                              )


                                ? "font-bold text-red-600"


                                : "font-semibold"


                            }


                          >


                            {


                              product.quantity


                            }{" "}


                            {


                              product.unit


                            }


                          </span>


                        </td>






                        <td className="px-4 py-4 font-semibold">


                          {formatPrice(


                            product.retail_price


                          )}


                        </td>






                        <td className="px-4 py-4">


                          {formatPrice(


                            product.wholesale_price


                          )}


                        </td>






                        <td className="px-4 py-4">


                          {formatPrice(


                            product.last_purchase_price


                          )}


                        </td>
<td className="px-4 py-4">


                          {formatExpiry(


                            product.expiry_date


                          )}


                        </td>






                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                openEditProduct(product)
                              }
                              className="rounded-lg bg-blue-50 px-3 py-2 font-semibold text-blue-600 hover:bg-blue-100 dark:bg-blue-950/30 dark:hover:bg-blue-950/50"
                            >
                              ✏️ تعديل
                            </button>

                            <button
                              onClick={() =>
                                deleteProduct(product)
                              }
                              disabled={saving}
                              className="rounded-lg bg-red-50 px-3 py-2 font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50 dark:bg-red-950/30 dark:hover:bg-red-950/50"
                            >
                              🗑️ حذف
                            </button>
                          </div>
                        </td>






                      </tr>


                    )


                  )


                )}






              </tbody>






            </table>






          </div>






        </div>






        {/* PRODUCT MODAL */}


        {showProductModal && (


          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">






            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900">






              <div className="mb-6 flex items-center justify-between">






                <div>


                  <h2 className="text-2xl font-bold">


                    {editingProduct


                      ? "تعديل الصنف"


                      : "إضافة صنف جديد"}


                  </h2>






                  <p className="mt-1 text-sm text-gray-500">


                    بيانات المنتج الأساسية


                  </p>


                </div>






                <button


                  onClick={() => {


                    setShowProductModal(


                      false


                    );


                    setShowBarcodeScanner(


                      false


                    );


                  }}


                  className="text-2xl text-gray-400 hover:text-gray-700"


                >


                  ×


                </button>






              </div>






              <div className="grid gap-4 md:grid-cols-2">






                {/* PRODUCT NAME */}


                <Field


                  label="اسم الصنف *"


                  value={


                    productForm.name


                  }


                  onChange={(value) =>


                    setProductForm({


                      ...productForm,


                      name: value,


                    })


                  }


                />






                {/* CATEGORY */}
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label className="block text-sm font-semibold">
                      التصنيف
                    </label>

                    <button
                      type="button"
                      onClick={() => {
                        setMessage("");
                        setShowInlineCategory(
                          (current) => !current
                        );
                      }}
                      className="text-sm font-semibold text-blue-600 hover:text-blue-700"
                    >
                      + تصنيف جديد
                    </button>
                  </div>

                  <select
                    value={productForm.category_id}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        category_id: e.target.value,
                      })
                    }
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none dark:border-gray-700 dark:bg-gray-950"
                  >
                    <option value="">
                      بدون تصنيف
                    </option>

                    {categories.map((category) => (
                      <option
                        key={category.id}
                        value={category.id}
                      >
                        {category.name}
                      </option>
                    ))}
                  </select>

                  {showInlineCategory && (
                    <div className="mt-2 flex gap-2">
                      <input
                        autoFocus
                        type="text"
                        value={inlineCategoryName}
                        onChange={(e) =>
                          setInlineCategoryName(e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            addCategoryInsideProduct();
                          }
                        }}
                        placeholder="اسم التصنيف الجديد"
                        className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950"
                      />

                      <button
                        type="button"
                        onClick={addCategoryInsideProduct}
                        disabled={saving}
                        className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        إضافة
                      </button>
                    </div>
                  )}
                </div>

                {/* BARCODE */}


                <div>


                  <label className="mb-2 block text-sm font-semibold">


                    الباركود


                  </label>






                  <div className="flex gap-2">






                    <input


                      type="text"


                      value={


                        productForm.barcode


                      }


                      onChange={(e) =>


                        setProductForm({


                          ...productForm,


                          barcode:


                            e.target.value,


                        })


                      }


                      placeholder="اكتب الباركود يدويًا"


                      className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950"


                    />






                    <button


                      type="button"


                      onClick={() => {


                        setMessage("");


                        setShowBarcodeScanner(


                          true


                        );


                      }}


                      className="shrink-0 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700"


                    >


                      📷 Scan


                    </button>






                  </div>






                  {/* BARCODE SCANNER */}


                  {showBarcodeScanner && (


                    <BarcodeScanner


                      onScan={(


                        barcode


                      ) => {


                        setProductForm(


                          (


                            current


                          ) => ({


                            ...current,


                            barcode,


                          })


                        );






                        setShowBarcodeScanner(


                          false


                        );


                      }}


                      onClose={() => {


                        setShowBarcodeScanner(


                          false


                        );


                      }}


                    />


                  )}






                </div>






                {/* UNIT */}


                <div>


                  <label className="mb-2 block text-sm font-semibold">


                    الوحدة


                  </label>






                  <select


                    value={


                      productForm.unit


                    }


                    onChange={(e) =>


                      setProductForm({


                        ...productForm,


                        unit: e.target.value,


                      })


                    }


                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none dark:border-gray-700 dark:bg-gray-950"


                  >


                    <option value="piece">


                      قطعة


                    </option>






                    <option value="box">


                      علبة


                    </option>






                    <option value="bottle">


                      زجاجة


                    </option>






                    <option value="bag">


                      كيس


                    </option>






                    <option value="pack">


                      باكيت


                    </option>






                    <option value="kg">


                      كجم


                    </option>






                    <option value="liter">


                      لتر


                    </option>


                  </select>


                </div>






                {/* QUANTITY */}


                <Field


                  label="الكمية الحالية"


                  type="number"


                  value={


                    productForm.quantity


                  }


                  onChange={(value) =>


                    setProductForm({


                      ...productForm,


                      quantity: value,


                    })


                  }


                />






                {/* REORDER LEVEL */}


                <Field


                  label="حد إعادة الطلب"


                  type="number"


                  value={


                    productForm.reorder_level


                  }


                  onChange={(value) =>


                    setProductForm({


                      ...productForm,


                      reorder_level:


                        value,


                    })


                  }


                />






                {/* RETAIL */}


                <Field


                  label="سعر الجمهور"


                  type="number"


                  value={


                    productForm.retail_price


                  }


                  onChange={(value) =>


                    setProductForm({


                      ...productForm,


                      retail_price:


                        value,


                    })


                  }


                />






                {/* WHOLESALE */}


                <Field


                  label="سعر الجملة"


                  type="number"


                  value={


                    productForm.wholesale_price


                  }


                  onChange={(value) =>


                    setProductForm({


                      ...productForm,


                      wholesale_price:


                        value,


                    })


                  }


                />






                {/* LAST PURCHASE */}


                <Field


                  label="آخر سعر شراء"


                  type="number"


                  value={


                    productForm.last_purchase_price


                  }


                  onChange={(value) =>


                    setProductForm({


                      ...productForm,


                      last_purchase_price:


                        value,


                    })


                  }


                />






                {/* EXPIRY */}


                <div>


                  <label className="mb-2 block text-sm font-semibold">


                    تاريخ الصلاحية


                  </label>






                  <input


                    type="date"


                    value={


                      productForm.expiry_date


                    }


                    onChange={(e) =>


                      setProductForm({


                        ...productForm,


                        expiry_date:


                          e.target.value,


                      })


                    }


                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none dark:border-gray-700 dark:bg-gray-950"


                  />


                </div>






                {/* NOTES */}


                <div className="md:col-span-2">






                  <label className="mb-2 block text-sm font-semibold">


                    ملاحظات


                  </label>






                  <textarea


                    value={


                      productForm.notes


                    }


                    onChange={(e) =>


                      setProductForm({


                        ...productForm,


                        notes: e.target.value,


                      })


                    }


                    rows={3}


                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none dark:border-gray-700 dark:bg-gray-950"


                  />






                </div>






              </div>






              {message && (


                <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">


                  {message}


                </div>


              )}






              {/* BUTTONS */}


              <div className="mt-6 flex justify-end gap-3">






                <button


                  onClick={() => {


                    setShowProductModal(


                      false


                    );


                    setShowBarcodeScanner(


                      false


                    );


                  }}


                  className="rounded-xl border border-gray-200 px-5 py-3 font-semibold dark:border-gray-700"


                >


                  إلغاء


                </button>






                <button


                  onClick={


                    saveProduct


                  }


                  disabled={saving}


                  className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"


                >


                  {saving


                    ? "جاري الحفظ..."


                    : editingProduct


                    ? "حفظ التعديلات"


                    : "إضافة الصنف"}


                </button>






              </div>






            </div>






          </div>


        )}






        {/* CATEGORY MODAL */}


        {showCategoryModal && (


          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">






            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900">






              <div className="mb-5 flex items-center justify-between">






                <h2 className="text-xl font-bold">


                  إضافة تصنيف جديد


                </h2>






                <button


                  onClick={() =>


                    setShowCategoryModal(


                      false


                    )


                  }


                  className="text-2xl text-gray-400"


                >


                  ×


                </button>






              </div>






              <input


                autoFocus


                value={


                  categoryName


                }


                onChange={(e) =>


                  setCategoryName(


                    e.target.value


                  )


                }


                onKeyDown={(e) => {


                  if (


                    e.key ===


                    "Enter"


                  ) {


                    addCategory();


                  }


                }}


                placeholder="مثال: مستلزمات طبية"


                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950"


              />






              {message && (


                <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">


                  {message}


                </div>


              )}






              <div className="mt-5 flex justify-end gap-3">






                <button


                  onClick={() =>


                    setShowCategoryModal(


                      false


                    )


                  }


                  className="rounded-xl border border-gray-200 px-5 py-3 font-semibold dark:border-gray-700"


                >


                  إلغاء


                </button>






                <button


                  onClick={


                    addCategory


                  }


                  disabled={saving}


                  className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"


                >


                  {saving


                    ? "جاري الإضافة..."


                    : "إضافة"}


                </button>






              </div>






            </div>






          </div>


        )}






      </div>


    </main>


  );


}








/* =========================================================


   BARCODE SCANNER


========================================================= */






function BarcodeScanner({


  onScan,


  onClose,


}: {


  onScan: (barcode: string) => void;


  onClose: () => void;


}) {


  const videoRef =


    useRef<HTMLVideoElement | null>(


      null


    );






  const readerRef =


    useRef<BrowserMultiFormatReader | null>(


      null


    );






  useEffect(() => {


    const reader =


      new BrowserMultiFormatReader();






    readerRef.current =


      reader;






    let stopped = false;






    async function startScanner() {


      try {


        const devices =


          await BrowserMultiFormatReader.listVideoInputDevices();






        if (


          !devices ||


          devices.length === 0


        ) {


          alert(


            "لم يتم العثور على كاميرا"


          );






          onClose();


          return;


        }






        /*


         * بنختار آخر كاميرا متاحة.


         * على الموبايل غالبًا بتكون الكاميرا الخلفية.


         */


        const deviceId =


          devices[


            devices.length - 1


          ]?.deviceId;






        if (


          !videoRef.current ||


          stopped


        ) {


          return;


        }






        reader.decodeFromVideoDevice(


          deviceId,


          videoRef.current,


          (result) => {


            if (


              !result ||


              stopped


            ) {


              return;


            }






            const barcode =


              result


                .getText()


                .trim();






            if (!barcode) {


              return;


            }






            stopped = true;






            onScan(barcode);






            if (videoRef.current?.srcObject) {
              const stream = videoRef.current.srcObject as MediaStream;
              stream.getTracks().forEach((track) => track.stop());
              videoRef.current.srcObject = null;
            }


          }


        );


      } catch (error) {


        console.error(


          "Barcode scanner error:",


          error


        );






        alert(


          "تعذر تشغيل الكاميرا. تأكد من السماح للموقع باستخدام الكاميرا."


        );






        onClose();


      }


    }






    startScanner();






    return () => {


      stopped = true;






      try {


        if (videoRef.current?.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach((track) => track.stop());
          videoRef.current.srcObject = null;
        }


      } catch {


        // ignore


      }


    };


  }, [onScan, onClose]);






  return (


    <div className="mt-4 overflow-hidden rounded-2xl border border-blue-200 bg-black shadow-lg dark:border-blue-900">






      <div className="relative">






        <video


          ref={videoRef}


          className="h-64 w-full object-cover"


          autoPlay


          muted


          playsInline


        />






        {/* SCAN FRAME */}


        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">






          <div className="relative h-28 w-72">






            <div className="absolute left-0 top-0 h-8 w-8 border-l-4 border-t-4 border-blue-500" />






            <div className="absolute right-0 top-0 h-8 w-8 border-r-4 border-t-4 border-blue-500" />






            <div className="absolute bottom-0 left-0 h-8 w-8 border-b-4 border-l-4 border-blue-500" />






            <div className="absolute bottom-0 right-0 h-8 w-8 border-b-4 border-r-4 border-blue-500" />






            <div className="absolute left-3 right-3 top-1/2 h-0.5 bg-red-500 shadow-lg" />






          </div>






        </div>






      </div>






      <div className="flex items-center justify-between gap-3 bg-gray-950 px-4 py-3 text-white">






        <div>


          <div className="text-sm font-semibold">


            📷 مسح الباركود


          </div>






          <div className="mt-1 text-xs text-gray-400">


            وجّه الكاميرا ناحية الباركود


          </div>


        </div>






        <button


          type="button"


          onClick={


            onClose


          }


          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold hover:bg-red-700"


        >


          إغلاق


        </button>






      </div>






    </div>


  );


}








/* =========================================================


   FORM FIELD


========================================================= */






function Field({


  label,


  value,


  onChange,


  type = "text",


}: {


  label: string;


  value: string;


  onChange: (


    value: string


  ) => void;


  type?: string;


}) {


  return (


    <div>






      <label className="mb-2 block text-sm font-semibold">


        {label}


      </label>






      <input


        type={type}


        value={value}


        onChange={(e) =>


          onChange(


            e.target.value


          )


        }


        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950"


      />






    </div>


  );


}





