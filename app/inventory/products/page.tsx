



















"use client";






import { useEffect, useMemo, useRef, useState } from "react";


import { BrowserMultiFormatReader } from "@zxing/browser";


import { getClinicDb, getClinicContext } from "@/lib/clinic-db";






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
  is_active: boolean;


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






    
    let context;
    let db;

    try {
      context = await getClinicContext();
      db = await getClinicDb();
    } catch (error) {
      console.error(error);
      setMessage("تعذر الاتصال ببيانات العيادة");
      setLoading(false);
      return;
    }

    if (!["owner", "admin"].includes(context.role)) {
      setMessage("ليس لديك صلاحية إدارة المخزون");
      setLoading(false);
      return;
    }

    const [productsResult, categoriesResult] =


      await Promise.all([


        db


          .from("products")


          .select(`


            *,


            category:product_categories (


              name


            )


          `)


          .eq("clinic_id", context.clinic_id)
          .eq("is_active", true)
          .order("created_at", {


            ascending: false,


          }),






        db


          .from("product_categories")


          .select("*")


          .eq("clinic_id", context.clinic_id)


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






    
    const context = await getClinicContext();
    const db = await getClinicDb();
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


      clinic_id: context.clinic_id,


    };






    let error;






    if (editingProduct) {


      const result =


        await db


          .from("products")


          .update(payload)


          .eq(


            "id",


            editingProduct.id


          )
          .eq("clinic_id", context.clinic_id);






      error = result.error;


    } else {


      const result =


        await db


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

    
    const context = await getClinicContext();
    const db = await getClinicDb();
const { data, error } = await db
      .from("product_categories")
      .insert({ name, clinic_id: context.clinic_id })
      .select("id, name")
      .single();

    if (error) {
      if (error.code === "23505") {
        const { data: existing } = await db
          .from("product_categories")
          .select("id, name")
          .eq("name", name)
          .eq("clinic_id", context.clinic_id)
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

    
    const context = await getClinicContext();
    const db = await getClinicDb();
const { error } = await db
      .from("products")
      .update({ is_active: false })
      .eq("id", product.id)
      .eq("clinic_id", context.clinic_id);

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






    
    const context = await getClinicContext();
    const db = await getClinicDb();
const { error } =


      await db


        .from("product_categories")


        .insert({


          name,


          clinic_id: context.clinic_id,


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







function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
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
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950"
      />
    </div>
  );
}

function BarcodeScanner({
  onScan,
  onClose,
}: {
  onScan: (barcode: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

  useEffect(() => {
    let stopped = false;
    let animationFrame = 0;
    let lastDetectTime = 0;
    let nativeDetector: {
      detect: (
        source: CanvasImageSource
      ) => Promise<Array<{ rawValue?: string }>>;
    } | null = null;
    let stream: MediaStream | null = null;
    let controls: { stop: () => void } | null = null;
    let zxingBusy = false;

    const sourceCanvas = document.createElement("canvas");
    const enhancedCanvas = document.createElement("canvas");
    const workCanvas = document.createElement("canvas");

    const stopCamera = () => {
      stopped = true;

      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }

      try {
        controls?.stop();
      } catch {
        // ignore
      }

      controls = null;

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }

      const video = videoRef.current;

      if (video?.srcObject) {
        const currentStream = video.srcObject as MediaStream;
        currentStream.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
      }
    };

    const applyCameraEnhancements = async (
      currentStream: MediaStream
    ) => {
      const track = currentStream.getVideoTracks()[0];

      if (!track) return;

      try {
        const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
          focusMode?: string[];
          zoom?: {
            min: number;
            max: number;
            step?: number;
          };
          torch?: boolean;
        };

        const advanced: MediaTrackConstraintSet[] = [];

        if (capabilities.focusMode?.includes("continuous")) {
          advanced.push({ focusMode: "continuous" } as MediaTrackConstraintSet);
        }

        // Mild optical/digital camera zoom only. Too much zoom can make
        // small/soft barcodes harder to decode.
        if (capabilities.zoom) {
          const minZoom = capabilities.zoom.min;
          const maxZoom = capabilities.zoom.max;
          const step = capabilities.zoom.step || 0.1;
          const targetZoom = Math.min(
            maxZoom,
            Math.max(minZoom, minZoom + Math.max(step, 0.5))
          );

          if (targetZoom > minZoom) {
            advanced.push({ zoom: targetZoom } as MediaTrackConstraintSet);
          }
        }

        if (advanced.length) {
          await track.applyConstraints({ advanced });
        }
      } catch {
        // Camera capabilities differ by device/browser.
      }
    };

    const getNativeBarcodeDetector = () => {
      const browserWindow = window as unknown as {
        BarcodeDetector?: new (options?: {
          formats?: string[];
        }) => {
          detect: (
            source: CanvasImageSource
          ) => Promise<Array<{ rawValue?: string }>>;
        };
      };

      if (!browserWindow.BarcodeDetector) return null;

      try {
        return new browserWindow.BarcodeDetector({
          formats: [
            "ean_13",
            "ean_8",
            "upc_a",
            "upc_e",
            "code_128",
            "code_39",
            "itf",
            "codabar",
          ],
        });
      } catch {
        return null;
      }
    };

    const getVideoDimensions = (video: HTMLVideoElement) => {
      const width = video.videoWidth || 1920;
      const height = video.videoHeight || 1080;
      return { width, height };
    };

    const drawBarcodeRegion = (
      video: HTMLVideoElement,
      scale = 2
    ) => {
      const { width, height } = getVideoDimensions(video);

      // Large central ROI. It is intentionally generous so the user does not
      // have to place the barcode perfectly inside the guide.
      const cropWidth = Math.floor(width * 0.82);
      const cropHeight = Math.floor(height * 0.62);
      const sx = Math.floor((width - cropWidth) / 2);
      const sy = Math.floor((height - cropHeight) / 2);

      const targetWidth = Math.min(1800, Math.max(1000, Math.floor(cropWidth * scale)));
      const targetHeight = Math.min(1200, Math.max(600, Math.floor(cropHeight * scale)));

      sourceCanvas.width = targetWidth;
      sourceCanvas.height = targetHeight;

      const sourceContext = sourceCanvas.getContext("2d", {
        willReadFrequently: true,
      });

      if (!sourceContext) return null;

      sourceContext.imageSmoothingEnabled = true;
      sourceContext.imageSmoothingQuality = "high";
      sourceContext.drawImage(
        video,
        sx,
        sy,
        cropWidth,
        cropHeight,
        0,
        0,
        targetWidth,
        targetHeight
      );

      return sourceCanvas;
    };

    const makeEnhancedCanvas = (
      input: HTMLCanvasElement,
      mode: "contrast" | "threshold" | "sharpen"
    ) => {
      const width = input.width;
      const height = input.height;
      const outputCanvas = document.createElement("canvas");
      outputCanvas.width = width;
      outputCanvas.height = height;

      const inputContext = input.getContext("2d", {
        willReadFrequently: true,
      });
      const outputContext = outputCanvas.getContext("2d", {
        willReadFrequently: true,
      });

      if (!inputContext || !outputContext) return null;

      const image = inputContext.getImageData(0, 0, width, height);
      const src = image.data;
      const out = new Uint8ClampedArray(src.length);

      if (mode === "sharpen") {
        const copy = new Uint8ClampedArray(src);

        for (let y = 1; y < height - 1; y += 1) {
          for (let x = 1; x < width - 1; x += 1) {
            const i = (y * width + x) * 4;
            const left = i - 4;
            const right = i + 4;
            const top = i - width * 4;
            const bottom = i + width * 4;

            for (let channel = 0; channel < 3; channel += 1) {
              const value =
                copy[i + channel] * 3.5 -
                copy[left + channel] * 0.625 -
                copy[right + channel] * 0.625 -
                copy[top + channel] * 0.625 -
                copy[bottom + channel] * 0.625;

              out[i + channel] = Math.max(0, Math.min(255, value));
            }

            out[i + 3] = 255;
          }
        }
      } else {
        for (let i = 0; i < src.length; i += 4) {
          const r = src[i];
          const g = src[i + 1];
          const b = src[i + 2];
          let gray = 0.299 * r + 0.587 * g + 0.114 * b;

          if (mode === "contrast") {
            gray = (gray - 128) * 1.45 + 128;
            gray = Math.max(0, Math.min(255, gray));
          } else {
            // Keep this variant deliberately mild. A hard threshold can
            // destroy thin bars when the source image is already blurry.
            gray = gray > 128 ? 255 : 0;
          }

          out[i] = gray;
          out[i + 1] = gray;
          out[i + 2] = gray;
          out[i + 3] = 255;
        }
      }

      outputContext.putImageData(new ImageData(out, width, height), 0, 0);
      return outputCanvas;
    };

    const makeTighterCrop = (input: HTMLCanvasElement) => {
      const width = input.width;
      const height = input.height;
      const cropWidth = Math.floor(width * 0.92);
      const cropHeight = Math.floor(height * 0.78);
      const sx = Math.floor((width - cropWidth) / 2);
      const sy = Math.floor((height - cropHeight) / 2);

      const canvas = document.createElement("canvas");
      canvas.width = Math.min(1800, Math.max(1200, cropWidth));
      canvas.height = Math.min(1200, Math.max(800, cropHeight));

      const context = canvas.getContext("2d", {
        willReadFrequently: true,
      });

      if (!context) return null;

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(
        input,
        sx,
        sy,
        cropWidth,
        cropHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );

      return canvas;
    };

    const tryNativeOnCanvases = async (
      canvases: HTMLCanvasElement[]
    ) => {
      if (!nativeDetector) return "";

      for (const canvas of canvases) {
        if (stopped) return "";

        try {
          const results = await nativeDetector.detect(canvas);
          const value = results
            .map((item) => item.rawValue?.trim() || "")
            .find(Boolean);

          if (value) return value;
        } catch {
          // Try the next processed frame.
        }
      }

      return "";
    };

    const tryZxingOnCanvases = async (
      reader: BrowserMultiFormatReader,
      canvases: HTMLCanvasElement[]
    ) => {
      for (const canvas of canvases) {
        if (stopped) return "";

        try {
          const result = reader.decodeFromCanvas(canvas);
          const value = result.getText().trim();
          if (value) return value;
        } catch {
          // Expected when a frame does not contain a decodable barcode.
        }
      }

      return "";
    };

    const buildProcessingVariants = (video: HTMLVideoElement) => {
      const base = drawBarcodeRegion(video, 2);
      if (!base) return [];

      const tighter = makeTighterCrop(base);
      const contrast = makeEnhancedCanvas(base, "contrast");
      const sharpen = makeEnhancedCanvas(base, "sharpen");

      return [
        base,
        tighter,
        contrast,
        sharpen,
      ].filter(Boolean) as HTMLCanvasElement[];
    };

    const finishScan = (value: string) => {
      if (!value || stopped) return;
      stopped = true;
      onScanRef.current(value);
      stopCamera();
    };

    async function startSmartScanner() {
      if (!navigator.mediaDevices?.getUserMedia) return false;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30, max: 60 },
          },
        });

        const video = videoRef.current;

        if (stopped || !video) {
          stopCamera();
          return true;
        }

        video.srcObject = stream;
        await video.play();
        await applyCameraEnhancements(stream);

        nativeDetector = getNativeBarcodeDetector();

        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 40,
          delayBetweenScanSuccess: 200,
          tryPlayVideoTimeout: 5000,
        });

        readerRef.current = reader;

        let lastSmartProcessTime = 0;
        let fastCanvas: HTMLCanvasElement | null = null;

        const prepareFastCanvas = () => {
          const width = video.videoWidth || 1280;
          const height = video.videoHeight || 720;
          const maxWidth = 1280;
          const scale = Math.min(1, maxWidth / width);
          const targetWidth = Math.max(640, Math.floor(width * scale));
          const targetHeight = Math.max(360, Math.floor(height * scale));

          if (!fastCanvas) fastCanvas = document.createElement("canvas");
          if (fastCanvas.width !== targetWidth || fastCanvas.height !== targetHeight) {
            fastCanvas.width = targetWidth;
            fastCanvas.height = targetHeight;
          }

          const ctx = fastCanvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return null;
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
          return fastCanvas;
        };

        const detectLoop = async (timestamp: number) => {
          if (stopped || !videoRef.current) return;
          animationFrame = requestAnimationFrame(detectLoop);

          if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
          if (zxingBusy || timestamp - lastDetectTime < 85) return;
          lastDetectTime = timestamp;
          zxingBusy = true;

          try {
            // FAST PATH: use the real video frame first. Large/clear barcodes
            // should normally be decoded here without any expensive processing.
            if (nativeDetector) {
              try {
                const nativeResults = await nativeDetector.detect(video);
                const value = nativeResults
                  .map((item) => item.rawValue?.trim() || "")
                  .find(Boolean);
                if (value) {
                  finishScan(value);
                  return;
                }
              } catch {
                // Continue to ZXing fast path.
              }
            }

            const fast = prepareFastCanvas();
            if (fast) {
              try {
                const value = reader.decodeFromCanvas(fast).getText().trim();
                if (value) {
                  finishScan(value);
                  return;
                }
              } catch {
                // Normal frame was not enough; smart processing may help.
              }
            }

            // SMART PATH: run only periodically, so the CPU is not hammered
            // while the user is simply moving a large/clear barcode around.
            if (timestamp - lastSmartProcessTime >= 650) {
              lastSmartProcessTime = timestamp;
              const canvases = buildProcessingVariants(video);
              if (canvases.length) {
                const nativeValue = await tryNativeOnCanvases(canvases);
                if (nativeValue) {
                  finishScan(nativeValue);
                  return;
                }

                const zxingValue = await tryZxingOnCanvases(reader, canvases);
                if (zxingValue) {
                  finishScan(zxingValue);
                  return;
                }
              }
            }
          } finally {
            zxingBusy = false;
          }
        };

        animationFrame = requestAnimationFrame(detectLoop);
        return true;
      } catch (error) {
        console.warn("Smart barcode scanner unavailable:", error);
        stopCamera();
        return false;
      }
    }

    async function startFallbackScanner() {
      try {
        const video = videoRef.current;
        if (!video || stopped) return;

        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 40,
          delayBetweenScanSuccess: 200,
          tryPlayVideoTimeout: 5000,
        });

        readerRef.current = reader;

        controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30, max: 60 },
            },
          },
          video,
          (result) => {
            if (!result || stopped) return;

            const value = result.getText().trim();
            if (value) finishScan(value);
          }
        );

        if (stopped) return;

        const currentStream = video.srcObject as MediaStream | null;
        if (currentStream) {
          stream = currentStream;
          await applyCameraEnhancements(currentStream);
        }
      } catch (error) {
        console.error("Barcode scanner error:", error);
        stopCamera();
        onCloseRef.current();
      }
    }

    async function startScanner() {
      const started = await startSmartScanner();
      if (stopped) return;
      if (!started) await startFallbackScanner();
    }

    void startScanner();

    return () => {
      stopCamera();
      readerRef.current = null;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <div>
            <div className="font-bold text-gray-900 dark:text-white">
              Scan Barcode V3.2
            </div>
            <div className="text-xs text-gray-500">
              تحسين تلقائي للباركود الصغير والـ low contrast
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Close scanner"
          >
            ✕
          </button>
        </div>

        <div className="relative bg-black">
          <video
            ref={videoRef}
            className="h-[70vh] max-h-[520px] min-h-[320px] w-full object-cover"
            autoPlay
            muted
            playsInline
          />

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-36 w-[88%] max-w-[420px]">
              <div className="absolute left-0 top-0 h-9 w-9 border-l-4 border-t-4 border-blue-500" />
              <div className="absolute right-0 top-0 h-9 w-9 border-r-4 border-t-4 border-blue-500" />
              <div className="absolute bottom-0 left-0 h-9 w-9 border-b-4 border-l-4 border-blue-500" />
              <div className="absolute bottom-0 right-0 h-9 w-9 border-b-4 border-r-4 border-blue-500" />
              <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-blue-500/90 shadow-[0_0_8px_rgba(59,130,246,0.9)]" />
            </div>
          </div>
        </div>

        <div className="px-4 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
          خليك على مسافة طبيعية وثبّت الموبايل ثانية واحدة. الـ scanner بيكبّر المنطقة ويجرّب أكثر من معالجة للصورة تلقائيًا.
        </div>
      </div>
    </div>
  );
}
