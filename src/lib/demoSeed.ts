import { doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { generateSafeId, getMakassarDateString } from './format';

export async function seedEzFlowCafeDemo(params: {
  uid: string;
  userName: string;
  userEmail: string;
  isSuperAdmin?: boolean;
}): Promise<{ businessId: string; primaryOutletId: string }> {
  const { uid, userName, userEmail, isSuperAdmin } = params;
  const businessId = generateSafeId('biz_ezflow_cafe');
  const outlet1Id = generateSafeId('out_canggu');
  const outlet2Id = generateSafeId('out_ubud');
  const memberUids = [uid];

  // 1. Create parent Business document first so security rules' exists()/get() pass for subcollections
  const businessPath = `businesses/${businessId}`;
  try {
    await setDoc(doc(db, 'businesses', businessId), {
      id: businessId,
      name: 'EzFlow Café',
      category: 'Coffee Shop',
      description: 'Kedai kopi spesialti dan bakery modern di Bali dengan racikan kopi Nusantara dan analitik operasional pintar.',
      ownerName: userName || 'Owner EzFlow Café',
      ownerUid: uid,
      memberUids,
      businessEmail: userEmail,
      phone: '+62 361 8492 110',
      address: 'Jl. Pantai Berawa No. 88, Canggu',
      city: 'Badung, Bali',
      country: 'Indonesia',
      currency: 'IDR',
      timezone: 'Asia/Makassar',
      outletCount: 2,
      operatingHours: '07:00 - 22:00 WITA',
      taxPercent: 10,
      serviceChargePercent: 5,
      paymentMethods: ['Tunai', 'QRIS', 'Debit', 'Transfer Bank'],
      lowStockThreshold: 15,
      openingHour: '07:00',
      closingHour: '22:00',
      isDemo: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, businessPath);
  }

  // 2. Batch-create outlets, categories, suppliers, ingredients, products, employees, shifts, transactions, expenses, tasks, CCTV, notifications
  const batch = writeBatch(db);
  const ts = serverTimestamp();

  // Outlets
  batch.set(doc(db, 'businesses', businessId, 'outlets', outlet1Id), {
    id: outlet1Id,
    businessId,
    ownerUid: uid,
    memberUids,
    name: 'EzFlow Café — Canggu',
    address: 'Jl. Pantai Berawa No. 88, Canggu, Bali',
    contactNumber: '+62 361 8492 110',
    operatingHours: '07:00 - 22:00 WITA',
    tableCount: 14,
    capacity: 48,
    isActive: true,
    isArchived: false,
    createdAt: ts,
    updatedAt: ts,
  });

  batch.set(doc(db, 'businesses', businessId, 'outlets', outlet2Id), {
    id: outlet2Id,
    businessId,
    ownerUid: uid,
    memberUids,
    name: 'EzFlow Café — Ubud',
    address: 'Jl. Monkey Forest No. 42, Ubud, Bali',
    contactNumber: '+62 361 9712 405',
    operatingHours: '07:30 - 21:30 WITA',
    tableCount: 10,
    capacity: 32,
    isActive: true,
    isArchived: false,
    createdAt: ts,
    updatedAt: ts,
  });

  // Categories
  const catCoffeeId = generateSafeId('cat_coffee');
  const catNonCoffeeId = generateSafeId('cat_noncoffee');
  const catFoodId = generateSafeId('cat_food');

  batch.set(doc(db, 'businesses', businessId, 'categories', catCoffeeId), {
    id: catCoffeeId,
    businessId,
    ownerUid: uid,
    memberUids,
    name: 'Kopi & Espresso',
    sortOrder: 1,
    createdAt: ts,
    updatedAt: ts,
  });
  batch.set(doc(db, 'businesses', businessId, 'categories', catNonCoffeeId), {
    id: catNonCoffeeId,
    businessId,
    ownerUid: uid,
    memberUids,
    name: 'Non-Kopi & Minuman',
    sortOrder: 2,
    createdAt: ts,
    updatedAt: ts,
  });
  batch.set(doc(db, 'businesses', businessId, 'categories', catFoodId), {
    id: catFoodId,
    businessId,
    ownerUid: uid,
    memberUids,
    name: 'Pastry & Makanan',
    sortOrder: 3,
    createdAt: ts,
    updatedAt: ts,
  });

  // Suppliers
  const supKopiId = generateSafeId('sup_kopi');
  const supDairyId = generateSafeId('sup_dairy');
  const supBakeryId = generateSafeId('sup_bakery');

  batch.set(doc(db, 'businesses', businessId, 'suppliers', supKopiId), {
    id: supKopiId,
    businessId,
    ownerUid: uid,
    memberUids,
    name: 'PT Kintamani Roastery Bali',
    contactName: 'I Made Surya',
    phone: '+62 812 3901 4421',
    email: 'order@kintamaniroastery.id',
    address: 'Jl. Raya Kintamani Km 14, Bangli, Bali',
    createdAt: ts,
    updatedAt: ts,
  });
  batch.set(doc(db, 'businesses', businessId, 'suppliers', supDairyId), {
    id: supDairyId,
    businessId,
    ownerUid: uid,
    memberUids,
    name: 'CV Segar Nusantara Distribusi',
    contactName: 'Ni Luh Putu Ayu',
    phone: '+62 813 3822 7710',
    email: 'distribusi@segarnusantara.co.id',
    address: 'Jl. Sunset Road No. 105, Kuta, Bali',
    createdAt: ts,
    updatedAt: ts,
  });
  batch.set(doc(db, 'businesses', businessId, 'suppliers', supBakeryId), {
    id: supBakeryId,
    businessId,
    ownerUid: uid,
    memberUids,
    name: 'Artisan Bakehouse Denpasar',
    contactName: 'Bagus Pratama',
    phone: '+62 818 0551 9920',
    email: 'halo@artisanbakehouse.id',
    address: 'Jl. Teuku Umar Barat No. 28, Denpasar',
    createdAt: ts,
    updatedAt: ts,
  });

  // Ingredients for Outlet 1 (Canggu) & Outlet 2 (Ubud)
  const ingEspressoId = generateSafeId('ing_espresso');
  const ingMilkId = generateSafeId('ing_milk');
  const ingPalmSugarId = generateSafeId('ing_palmsugar');
  const ingMatchaId = generateSafeId('ing_matcha');
  const ingChocoId = generateSafeId('ing_choco');
  const ingCupId = generateSafeId('ing_cup');
  const ingCroissantId = generateSafeId('ing_croissant');
  const ingSandwichId = generateSafeId('ing_sandwich');
  const ingWaterId = generateSafeId('ing_water');

  const ingredientsOutlet1 = [
    {
      id: ingEspressoId,
      name: 'Biji Kopi Espresso Blend',
      itemType: 'raw_material',
      unit: 'gram',
      stock: 4200,
      minStock: 1000,
      costPerUnit: 220, // Rp220/gram -> 18g = Rp3.960
      supplierId: supKopiId,
    },
    {
      id: ingMilkId,
      name: 'Susu Segar UHT Full Cream',
      itemType: 'raw_material',
      unit: 'ml',
      stock: 18500,
      minStock: 5000,
      costPerUnit: 22, // Rp22/ml -> 150ml = Rp3.300
      supplierId: supDairyId,
    },
    {
      id: ingPalmSugarId,
      name: 'Sirup Gula Aren Organik',
      itemType: 'raw_material',
      unit: 'ml',
      stock: 180, // Intentionally near/below low-stock threshold for demo alert!
      minStock: 500,
      costPerUnit: 45, // Rp45/ml -> 20ml = Rp900
      supplierId: supDairyId,
    },
    {
      id: ingMatchaId,
      name: 'Bubuk Uji Matcha Ceremonial',
      itemType: 'raw_material',
      unit: 'gram',
      stock: 640,
      minStock: 200,
      costPerUnit: 950, // 8g = Rp7.600
      supplierId: supDairyId,
    },
    {
      id: ingChocoId,
      name: 'Dark Chocolate Couverture Powder',
      itemType: 'raw_material',
      unit: 'gram',
      stock: 1400,
      minStock: 400,
      costPerUnit: 180, // 25g = Rp4.500
      supplierId: supDairyId,
    },
    {
      id: ingCupId,
      name: 'Gelas Cup & Lid 12oz',
      itemType: 'raw_material',
      unit: 'unit',
      stock: 340,
      minStock: 100,
      costPerUnit: 950,
      supplierId: supDairyId,
    },
    {
      id: ingCroissantId,
      name: 'Butter Croissant Ready-Bake',
      itemType: 'finished_good',
      unit: 'unit',
      stock: 14, // Low stock alert
      minStock: 15,
      costPerUnit: 11000,
      supplierId: supBakeryId,
    },
    {
      id: ingSandwichId,
      name: 'Chicken Sourdough Sandwich Pack',
      itemType: 'finished_good',
      unit: 'unit',
      stock: 22,
      minStock: 10,
      costPerUnit: 17500,
      supplierId: supBakeryId,
    },
    {
      id: ingWaterId,
      name: 'Air Mineral Botol 330ml',
      itemType: 'finished_good',
      unit: 'unit',
      stock: 72,
      minStock: 24,
      costPerUnit: 3200,
      supplierId: supDairyId,
    },
  ];

  for (const ing of ingredientsOutlet1) {
    batch.set(doc(db, 'businesses', businessId, 'ingredients', ing.id), {
      ...ing,
      businessId,
      outletId: outlet1Id,
      ownerUid: uid,
      memberUids,
      isDemo: true,
      createdAt: ts,
      updatedAt: ts,
    });
  }

  // Outlet 2 ingredients (so switching to Ubud supports the entire demo menu)
  const ubudIngredients = [
    { name: 'Biji Kopi Espresso Blend', itemType: 'raw_material', unit: 'gram', stock: 2800, minStock: 800, costPerUnit: 220, supplierId: supKopiId },
    { name: 'Susu Segar UHT Full Cream', itemType: 'raw_material', unit: 'ml', stock: 12000, minStock: 4000, costPerUnit: 22, supplierId: supDairyId },
    { name: 'Sirup Gula Aren Organik', itemType: 'raw_material', unit: 'ml', stock: 950, minStock: 400, costPerUnit: 45, supplierId: supDairyId },
    { name: 'Bubuk Uji Matcha Ceremonial', itemType: 'raw_material', unit: 'gram', stock: 420, minStock: 150, costPerUnit: 950, supplierId: supDairyId },
    { name: 'Dark Chocolate Couverture Powder', itemType: 'raw_material', unit: 'gram', stock: 900, minStock: 300, costPerUnit: 180, supplierId: supDairyId },
    { name: 'Gelas Cup & Lid 12oz', itemType: 'raw_material', unit: 'unit', stock: 220, minStock: 80, costPerUnit: 950, supplierId: supDairyId },
    { name: 'Butter Croissant Ready-Bake', itemType: 'finished_good', unit: 'unit', stock: 18, minStock: 10, costPerUnit: 11000, supplierId: supBakeryId },
    { name: 'Chicken Sourdough Sandwich Pack', itemType: 'finished_good', unit: 'unit', stock: 14, minStock: 8, costPerUnit: 17500, supplierId: supBakeryId },
    { name: 'Air Mineral Botol 330ml', itemType: 'finished_good', unit: 'unit', stock: 48, minStock: 20, costPerUnit: 3200, supplierId: supDairyId },
  ];
  for (const uIng of ubudIngredients) {
    const uId = generateSafeId('ing_ubud');
    batch.set(doc(db, 'businesses', businessId, 'ingredients', uId), {
      id: uId,
      ...uIng,
      businessId,
      outletId: outlet2Id,
      ownerUid: uid,
      memberUids,
      isDemo: true,
      createdAt: ts,
      updatedAt: ts,
    });
  }

  // Products (exact 8 menu items from prompt + recipes)
  const productsSpec = [
    {
      id: generateSafeId('prod_ksga'),
      name: 'Kopi Susu Gula Aren',
      categoryId: catCoffeeId,
      categoryName: 'Kopi & Espresso',
      price: 28000,
      cogs: 9110,
      imageUrl: '/src/assets/images/menu_kopi_susu_1795496136547.jpg',
      recipe: [
        { ingredientId: ingEspressoId, ingredientName: 'Biji Kopi Espresso Blend', quantity: 18, unit: 'gram' },
        { ingredientId: ingMilkId, ingredientName: 'Susu Segar UHT Full Cream', quantity: 150, unit: 'ml' },
        { ingredientId: ingPalmSugarId, ingredientName: 'Sirup Gula Aren Organik', quantity: 20, unit: 'ml' },
        { ingredientId: ingCupId, ingredientName: 'Gelas Cup & Lid 12oz', quantity: 1, unit: 'unit' },
      ],
    },
    {
      id: generateSafeId('prod_americano'),
      name: 'Americano',
      categoryId: catCoffeeId,
      categoryName: 'Kopi & Espresso',
      price: 22000,
      cogs: 4910,
      imageUrl: '',
      recipe: [
        { ingredientId: ingEspressoId, ingredientName: 'Biji Kopi Espresso Blend', quantity: 18, unit: 'gram' },
        { ingredientId: ingCupId, ingredientName: 'Gelas Cup & Lid 12oz', quantity: 1, unit: 'unit' },
      ],
    },
    {
      id: generateSafeId('prod_latte'),
      name: 'Café Latte',
      categoryId: catCoffeeId,
      categoryName: 'Kopi & Espresso',
      price: 30000,
      cogs: 8870,
      imageUrl: '/src/assets/images/menu_cafe_latte_1795496136727.jpg',
      recipe: [
        { ingredientId: ingEspressoId, ingredientName: 'Biji Kopi Espresso Blend', quantity: 18, unit: 'gram' },
        { ingredientId: ingMilkId, ingredientName: 'Susu Segar UHT Full Cream', quantity: 180, unit: 'ml' },
        { ingredientId: ingCupId, ingredientName: 'Gelas Cup & Lid 12oz', quantity: 1, unit: 'unit' },
      ],
    },
    {
      id: generateSafeId('prod_matcha'),
      name: 'Matcha Latte',
      categoryId: catNonCoffeeId,
      categoryName: 'Non-Kopi & Minuman',
      price: 32000,
      cogs: 12510,
      imageUrl: '/src/assets/images/menu_matcha_latte_1795496136795.jpg',
      recipe: [
        { ingredientId: ingMatchaId, ingredientName: 'Bubuk Uji Matcha Ceremonial', quantity: 8, unit: 'gram' },
        { ingredientId: ingMilkId, ingredientName: 'Susu Segar UHT Full Cream', quantity: 180, unit: 'ml' },
        { ingredientId: ingCupId, ingredientName: 'Gelas Cup & Lid 12oz', quantity: 1, unit: 'unit' },
      ],
    },
    {
      id: generateSafeId('prod_choco'),
      name: 'Chocolate',
      categoryId: catNonCoffeeId,
      categoryName: 'Non-Kopi & Minuman',
      price: 29000,
      cogs: 9410,
      imageUrl: '',
      recipe: [
        { ingredientId: ingChocoId, ingredientName: 'Dark Chocolate Couverture Powder', quantity: 25, unit: 'gram' },
        { ingredientId: ingMilkId, ingredientName: 'Susu Segar UHT Full Cream', quantity: 180, unit: 'ml' },
        { ingredientId: ingCupId, ingredientName: 'Gelas Cup & Lid 12oz', quantity: 1, unit: 'unit' },
      ],
    },
    {
      id: generateSafeId('prod_croissant'),
      name: 'Butter Croissant',
      categoryId: catFoodId,
      categoryName: 'Pastry & Makanan',
      price: 25000,
      cogs: 11000,
      imageUrl: '/src/assets/images/menu_butter_croissant_1795496137255.jpg',
      recipe: [
        { ingredientId: ingCroissantId, ingredientName: 'Butter Croissant Ready-Bake', quantity: 1, unit: 'unit' },
      ],
    },
    {
      id: generateSafeId('prod_sandwich'),
      name: 'Chicken Sandwich',
      categoryId: catFoodId,
      categoryName: 'Pastry & Makanan',
      price: 38000,
      cogs: 17500,
      imageUrl: '/src/assets/images/menu_chicken_sandwich_1795496137915.jpg',
      recipe: [
        { ingredientId: ingSandwichId, ingredientName: 'Chicken Sourdough Sandwich Pack', quantity: 1, unit: 'unit' },
      ],
    },
    {
      id: generateSafeId('prod_water'),
      name: 'Mineral Water',
      categoryId: catNonCoffeeId,
      categoryName: 'Non-Kopi & Minuman',
      price: 10000,
      cogs: 3200,
      imageUrl: '',
      recipe: [
        { ingredientId: ingWaterId, ingredientName: 'Air Mineral Botol 330ml', quantity: 1, unit: 'unit' },
      ],
    },
  ];

  for (const prod of productsSpec) {
    batch.set(doc(db, 'businesses', businessId, 'products', prod.id), {
      ...prod,
      businessId,
      ownerUid: uid,
      memberUids,
      isAvailable: true,
      isArchived: false,
      isDemo: true,
      createdAt: ts,
      updatedAt: ts,
    });
  }

  // Employees
  const empOwnerId = generateSafeId('emp_owner');
  const empMgrId = generateSafeId('emp_mgr');
  const empCashierId = generateSafeId('emp_cashier');
  const empBaristaId = generateSafeId('emp_barista');
  const empUbudMgrId = generateSafeId('emp_ubud');

  const employeesData = [
    { id: empOwnerId, userUid: uid, name: userName || 'Pemilik Bisnis', email: userEmail, phone: '+62 811 3980 101', position: 'Pemilik & Direktur', role: 'OWNER', outletId: outlet1Id, status: 'active' },
    { id: empMgrId, name: 'Raka Mahendra', email: 'raka@ezflowcafe.id', phone: '+62 812 4410 8821', position: 'Store Manager Canggu', role: 'MANAGER', outletId: outlet1Id, status: 'active' },
    { id: empCashierId, name: 'Sinta Dewi', email: 'sinta@ezflowcafe.id', phone: '+62 813 9021 3340', position: 'Kasir Senior', role: 'CASHIER', outletId: outlet1Id, status: 'active' },
    { id: empBaristaId, name: 'Dimas Wijaya', email: 'dimas@ezflowcafe.id', phone: '+62 819 7721 1204', position: 'Head Barista', role: 'STAFF', outletId: outlet1Id, status: 'active' },
    { id: empUbudMgrId, name: 'Putri Lestari', email: 'putri@ezflowcafe.id', phone: '+62 817 6201 9912', position: 'Outlet Supervisor Ubud', role: 'MANAGER', outletId: outlet2Id, status: 'active' },
  ];

  for (const emp of employeesData) {
    batch.set(doc(db, 'businesses', businessId, 'employees', emp.id), {
      ...emp,
      businessId,
      ownerUid: uid,
      memberUids,
      createdAt: ts,
      updatedAt: ts,
    });
  }

  // Shifts for today & tomorrow
  const todayStr = getMakassarDateString(new Date());
  const tomorrowStr = getMakassarDateString(new Date(Date.now() + 24 * 3600 * 1000));
  const shiftsData = [
    { employeeId: empCashierId, employeeName: 'Sinta Dewi', outletId: outlet1Id, shiftDate: todayStr, startTime: '07:00', endTime: '15:00', notes: 'Shift Pagi Kasir' },
    { employeeId: empBaristaId, employeeName: 'Dimas Wijaya', outletId: outlet1Id, shiftDate: todayStr, startTime: '07:00', endTime: '15:00', notes: 'Opening Bar Espresso' },
    { employeeId: empMgrId, employeeName: 'Raka Mahendra', outletId: outlet1Id, shiftDate: todayStr, startTime: '10:00', endTime: '18:00', notes: 'Supervisi Operasional & Stok' },
    { employeeId: empUbudMgrId, employeeName: 'Putri Lestari', outletId: outlet2Id, shiftDate: tomorrowStr, startTime: '07:30', endTime: '15:30', notes: 'Shift Pagi Ubud' },
  ];

  for (const sh of shiftsData) {
    const shId = generateSafeId('shift');
    batch.set(doc(db, 'businesses', businessId, 'shifts', shId), {
      id: shId,
      businessId,
      ownerUid: uid,
      memberUids,
      ...sh,
      createdAt: ts,
      updatedAt: ts,
    });
  }

  // Realistic 14-day historical transactions (marked isDemo: true)
  const nowMs = Date.now();
  const sampleOrders = [
    { daysAgo: 0, hourOffset: 2, outletId: outlet1Id, outletName: 'EzFlow Café — Canggu', method: 'QRIS', picks: [[0, 2], [5, 1]] },
    { daysAgo: 0, hourOffset: 4, outletId: outlet1Id, outletName: 'EzFlow Café — Canggu', method: 'Tunai', picks: [[2, 1], [6, 1]] },
    { daysAgo: 0, hourOffset: 1, outletId: outlet2Id, outletName: 'EzFlow Café — Ubud', method: 'QRIS', picks: [[0, 1], [3, 2]] },
    { daysAgo: 1, hourOffset: 5, outletId: outlet1Id, outletName: 'EzFlow Café — Canggu', method: 'QRIS', picks: [[0, 3], [5, 2], [7, 1]] },
    { daysAgo: 1, hourOffset: 8, outletId: outlet1Id, outletName: 'EzFlow Café — Canggu', method: 'Debit', picks: [[2, 2], [6, 2]] },
    { daysAgo: 1, hourOffset: 3, outletId: outlet2Id, outletName: 'EzFlow Café — Ubud', method: 'Tunai', picks: [[1, 2], [4, 1]] },
    { daysAgo: 2, hourOffset: 6, outletId: outlet1Id, outletName: 'EzFlow Café — Canggu', method: 'QRIS', picks: [[0, 4], [3, 1], [5, 2]] },
    { daysAgo: 3, hourOffset: 4, outletId: outlet1Id, outletName: 'EzFlow Café — Canggu', method: 'Transfer Bank', picks: [[6, 3], [2, 2], [1, 2]] },
    { daysAgo: 4, hourOffset: 7, outletId: outlet2Id, outletName: 'EzFlow Café — Ubud', method: 'QRIS', picks: [[0, 2], [3, 2], [5, 1]] },
    { daysAgo: 5, hourOffset: 3, outletId: outlet1Id, outletName: 'EzFlow Café — Canggu', method: 'Tunai', picks: [[0, 3], [1, 1], [7, 2]] },
    { daysAgo: 6, hourOffset: 5, outletId: outlet1Id, outletName: 'EzFlow Café — Canggu', method: 'QRIS', picks: [[2, 3], [4, 2], [5, 2]] },
    { daysAgo: 8, hourOffset: 4, outletId: outlet1Id, outletName: 'EzFlow Café — Canggu', method: 'Debit', picks: [[0, 5], [6, 2]] },
    { daysAgo: 10, hourOffset: 6, outletId: outlet2Id, outletName: 'EzFlow Café — Ubud', method: 'QRIS', picks: [[3, 2], [2, 2], [5, 1]] },
    { daysAgo: 12, hourOffset: 5, outletId: outlet1Id, outletName: 'EzFlow Café — Canggu', method: 'Tunai', picks: [[0, 4], [1, 2], [6, 1]] },
  ] as const;

  sampleOrders.forEach((order, idx) => {
    const txId = generateSafeId(`tx_demo_${idx}`);
    const dt = new Date(nowMs - order.daysAgo * 24 * 3600 * 1000);
    dt.setUTCHours((2 + order.hourOffset) % 14 + 1, (idx * 17) % 60, 0, 0);
    const items = order.picks.map(([prodIdx, qty]) => {
      const p = productsSpec[prodIdx];
      return {
        productId: p.id,
        productName: p.name,
        quantity: qty,
        unitPrice: p.price,
        unitCogs: p.cogs,
        lineTotal: p.price * qty,
      };
    });
    const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
    const taxAmount = Math.round(subtotal * 0.1);
    const serviceChargeAmount = Math.round(subtotal * 0.05);
    const total = subtotal + taxAmount + serviceChargeAmount;
    const estimatedCogs = items.reduce((s, i) => s + i.unitCogs * i.quantity, 0);

    batch.set(doc(db, 'businesses', businessId, 'transactions', txId), {
      id: txId,
      businessId,
      outletId: order.outletId,
      outletName: order.outletName,
      ownerUid: uid,
      memberUids,
      receiptNumber: `INV-DEMO-${String(1001 + idx)}`,
      items,
      subtotal,
      discount: 0,
      taxAmount,
      serviceChargeAmount,
      total,
      estimatedCogs,
      paymentMethod: order.method,
      amountPaid: total,
      changeAmount: 0,
      status: 'completed',
      notes: 'Transaksi sampel demo historis',
      cashierUid: uid,
      cashierName: userName || 'Kasir Demo',
      occurredAt: dt.toISOString(),
      isDemo: true,
      createdAt: ts,
      updatedAt: ts,
    });
  });

  // Expenses (actual recorded operating expenses, marked isDemo)
  const expensesData = [
    { outletId: outlet1Id, category: 'Bahan Baku', description: 'Restock Biji Kopi Kintamani 10kg (Demo)', amount: 2200000, daysAgo: 1, paymentMethod: 'Transfer Bank' },
    { outletId: outlet1Id, category: 'Utilitas & Listrik', description: 'Tagihan Listrik & Air Outlet Canggu', amount: 1450000, daysAgo: 3, paymentMethod: 'Transfer Bank' },
    { outletId: outlet1Id, category: 'Gaji & Upah', description: 'Tunjangan Shift Barista & Kasir Mingguan', amount: 1850000, daysAgo: 5, paymentMethod: 'Transfer Bank' },
    { outletId: outlet2Id, category: 'Bahan Baku', description: 'Pembelian Susu Segar & Kemasan Ubud', amount: 980000, daysAgo: 2, paymentMethod: 'Tunai' },
    { outletId: outlet1Id, category: 'Pemasaran', description: 'Promo Konten Lokal Canggu', amount: 450000, daysAgo: 7, paymentMethod: 'QRIS' },
    { outletId: outlet1Id, category: 'Pemeliharaan', description: 'Kalibrasi & Pembersihan Mesin Espresso', amount: 350000, daysAgo: 9, paymentMethod: 'Tunai' },
  ];

  expensesData.forEach((exp) => {
    const expId = generateSafeId('exp_demo');
    const expDate = getMakassarDateString(new Date(nowMs - exp.daysAgo * 24 * 3600 * 1000));
    batch.set(doc(db, 'businesses', businessId, 'expenses', expId), {
      id: expId,
      businessId,
      outletId: exp.outletId,
      ownerUid: uid,
      memberUids,
      category: exp.category,
      description: exp.description,
      amount: exp.amount,
      expenseDate: expDate,
      paymentMethod: exp.paymentMethod,
      createdBy: uid,
      isDemo: true,
      createdAt: ts,
      updatedAt: ts,
    });
  });

  // Operational Tasks
  const tasksData = [
    { title: 'Kalibrasi grinder & cek suhu boiler mesin espresso', category: 'opening', assignedToId: empBaristaId, assignedToName: 'Dimas Wijaya', status: 'completed', outletId: outlet1Id },
    { title: 'Verifikasi modal kasir laci tunai & perangkat QRIS', category: 'opening', assignedToId: empCashierId, assignedToName: 'Sinta Dewi', status: 'completed', outletId: outlet1Id },
    { title: 'Sanitasi area bar, meja pelanggan & display pastry', category: 'cleaning', assignedToId: empBaristaId, assignedToName: 'Dimas Wijaya', status: 'in_progress', outletId: outlet1Id },
    { title: 'Stock opname harian sirup gula aren & susu UHT', category: 'closing', assignedToId: empMgrId, assignedToName: 'Raka Mahendra', status: 'pending', outletId: outlet1Id },
    { title: 'Backflush group head & pembersihan steam wand', category: 'maintenance', assignedToId: empBaristaId, assignedToName: 'Dimas Wijaya', status: 'pending', outletId: outlet1Id },
    { title: 'Rekap kas tutup shift sore & sinkronisasi nota', category: 'closing', assignedToId: empUbudMgrId, assignedToName: 'Putri Lestari', status: 'pending', outletId: outlet2Id },
  ];

  tasksData.forEach((task) => {
    const tId = generateSafeId('task');
    batch.set(doc(db, 'businesses', businessId, 'operational_tasks', tId), {
      id: tId,
      businessId,
      ownerUid: uid,
      memberUids,
      dueDate: todayStr,
      notes: 'Checklist standar operasional harian EzFlow Café',
      ...task,
      createdAt: ts,
      updatedAt: ts,
    });
  });

  // CCTV Cameras (Demo architecture)
  const cam1Id = generateSafeId('cam_main');
  const cam2Id = generateSafeId('cam_counter');
  batch.set(doc(db, 'businesses', businessId, 'cctv_cameras', cam1Id), {
    id: cam1Id,
    businessId,
    outletId: outlet1Id,
    ownerUid: uid,
    memberUids,
    name: 'Kamera 01 — Area Duduk Indoor & Meja 1–8',
    locationArea: 'Area Duduk Utama',
    retentionDays: 14,
    privacyNoticeEnabled: true,
    createdAt: ts,
    updatedAt: ts,
  });
  batch.set(doc(db, 'businesses', businessId, 'cctv_cameras', cam2Id), {
    id: cam2Id,
    businessId,
    outletId: outlet1Id,
    ownerUid: uid,
    memberUids,
    name: 'Kamera 02 — Antrean Kasir & Bar',
    locationArea: 'Area Kasir & Antrean',
    retentionDays: 14,
    privacyNoticeEnabled: true,
    createdAt: ts,
    updatedAt: ts,
  });

  // Notifications
  const notif1Id = generateSafeId('notif');
  const notif2Id = generateSafeId('notif');
  batch.set(doc(db, 'businesses', businessId, 'notifications', notif1Id), {
    id: notif1Id,
    businessId,
    outletId: outlet1Id,
    ownerUid: uid,
    memberUids,
    type: 'low_stock',
    title: 'Stok Sirup Gula Aren Menipis',
    message: 'Sisa Sirup Gula Aren Organik di Outlet Canggu tinggal 180 ml (di bawah ambang batas 500 ml).',
    isRead: false,
    createdAt: ts,
    updatedAt: ts,
  });
  batch.set(doc(db, 'businesses', businessId, 'notifications', notif2Id), {
    id: notif2Id,
    businessId,
    outletId: outlet1Id,
    ownerUid: uid,
    memberUids,
    type: 'low_stock',
    title: 'Stok Butter Croissant Hampir Batas Minimum',
    message: 'Sisa Butter Croissant Ready-Bake berjumlah 14 unit (batas minimum 15 unit).',
    isRead: false,
    createdAt: ts,
    updatedAt: ts,
  });

  // Update UserProfile activeBusinessId & onboardingCompleted
  batch.update(doc(db, 'users', uid), {
    activeBusinessId: businessId,
    onboardingCompleted: true,
    updatedAt: ts,
  });

  if (isSuperAdmin) {
    // Also log audit entry
    const logId = generateSafeId('audit');
    batch.set(doc(db, 'businesses', businessId, 'audit_logs', logId), {
      id: logId,
      businessId,
      ownerUid: uid,
      memberUids,
      action: 'DEMO_SEED_CREATED',
      entityType: 'business',
      entityId: businessId,
      details: 'Inisialisasi lingkungan demo EzFlow Café',
      actorUid: uid,
      actorName: userName,
      createdAt: ts,
      updatedAt: ts,
    });
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `businesses/${businessId}/batch_seed`);
  }

  return { businessId, primaryOutletId: outlet1Id };
}
