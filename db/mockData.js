// Mock data for Pay Per Piece dashboard
// This simulates the whs_pay_per_pcs table

const mockData = [
  {
    whs_id: 'WH001',
    staff_id: 'ST001',
    staff_no: 'EMP001',
    operator_name: 'Nguyen Van A',
    operator: 'NVA',
    labor_type_detail: 'full-time',
    grass_date: '2026-01-10',
    start_time: '08:00:00',
    end_time: '17:00:00',
    main_act_name: 'picking',
    main_act_name_pct: 70,
    total_hrs: 9,
    direct_hrs: 7.5,
    ob_direct_hrs: 6,
    picking_hrs: 5.5,
    sorting_hrs: 1,
    checking_hrs: 0.5,
    packing_hrs: 0.5,
    shipping_hrs: 0,
    indirect_hrs: 1,
    break_hrs: 0.5,
    pick_score_item: 120,
    sort_score_item: 80,
    check_score_item: 60,
    picked_item: 450,
    sorted_item: 120,
    checked_item: 80
  },
  {
    whs_id: 'WH001',
    staff_id: 'ST001',
    staff_no: 'EMP001',
    operator_name: 'Nguyen Van A',
    operator: 'NVA',
    labor_type_detail: 'full-time',
    grass_date: '2026-01-11',
    start_time: '08:00:00',
    end_time: '17:00:00',
    main_act_name: 'picking',
    main_act_name_pct: 75,
    total_hrs: 9,
    direct_hrs: 8,
    ob_direct_hrs: 6.5,
    picking_hrs: 6,
    sorting_hrs: 1.5,
    checking_hrs: 0.5,
    packing_hrs: 0,
    shipping_hrs: 0,
    indirect_hrs: 0.5,
    break_hrs: 0.5,
    pick_score_item: 130,
    sort_score_item: 90,
    check_score_item: 70,
    picked_item: 520,
    sorted_item: 150,
    checked_item: 90
  },
  {
    whs_id: 'WH001',
    staff_id: 'ST002',
    staff_no: 'EMP002',
    operator_name: 'Tran Thi B',
    operator: 'TTB',
    labor_type_detail: 'part-time',
    grass_date: '2026-01-10',
    start_time: '13:00:00',
    end_time: '17:00:00',
    main_act_name: 'sorting',
    main_act_name_pct: 80,
    total_hrs: 4,
    direct_hrs: 3.5,
    ob_direct_hrs: 3,
    picking_hrs: 0.5,
    sorting_hrs: 2.5,
    checking_hrs: 0.5,
    packing_hrs: 0,
    shipping_hrs: 0,
    indirect_hrs: 0.3,
    break_hrs: 0.2,
    pick_score_item: 40,
    sort_score_item: 150,
    check_score_item: 45,
    picked_item: 80,
    sorted_item: 280,
    checked_item: 60
  },
  {
    whs_id: 'WH001',
    staff_id: 'ST002',
    staff_no: 'EMP002',
    operator_name: 'Tran Thi B',
    operator: 'TTB',
    labor_type_detail: 'part-time',
    grass_date: '2026-01-11',
    start_time: '13:00:00',
    end_time: '17:00:00',
    main_act_name: 'sorting',
    main_act_name_pct: 85,
    total_hrs: 4,
    direct_hrs: 3.7,
    ob_direct_hrs: 3.2,
    picking_hrs: 0.3,
    sorting_hrs: 2.8,
    checking_hrs: 0.6,
    packing_hrs: 0,
    shipping_hrs: 0,
    indirect_hrs: 0.2,
    break_hrs: 0.1,
    pick_score_item: 35,
    sort_score_item: 160,
    check_score_item: 50,
    picked_item: 70,
    sorted_item: 320,
    checked_item: 75
  },
  {
    whs_id: 'WH002',
    staff_id: 'ST003',
    staff_no: 'EMP003',
    operator_name: 'Le Van C',
    operator: 'LVC',
    labor_type_detail: 'full-time',
    grass_date: '2026-01-10',
    start_time: '08:00:00',
    end_time: '17:00:00',
    main_act_name: 'checking',
    main_act_name_pct: 65,
    total_hrs: 9,
    direct_hrs: 7,
    ob_direct_hrs: 5.5,
    picking_hrs: 1,
    sorting_hrs: 1,
    checking_hrs: 4.5,
    packing_hrs: 0.5,
    shipping_hrs: 0,
    indirect_hrs: 1.5,
    break_hrs: 0.5,
    pick_score_item: 60,
    sort_score_item: 55,
    check_score_item: 180,
    picked_item: 180,
    sorted_item: 90,
    checked_item: 350
  },
  {
    whs_id: 'WH002',
    staff_id: 'ST003',
    staff_no: 'EMP003',
    operator_name: 'Le Van C',
    operator: 'LVC',
    labor_type_detail: 'full-time',
    grass_date: '2026-01-11',
    start_time: '08:00:00',
    end_time: '17:00:00',
    main_act_name: 'checking',
    main_act_name_pct: 70,
    total_hrs: 9,
    direct_hrs: 7.5,
    ob_direct_hrs: 6,
    picking_hrs: 0.8,
    sorting_hrs: 0.7,
    checking_hrs: 5,
    packing_hrs: 1,
    shipping_hrs: 0,
    indirect_hrs: 1,
    break_hrs: 0.5,
    pick_score_item: 55,
    sort_score_item: 50,
    check_score_item: 200,
    picked_item: 160,
    sorted_item: 80,
    checked_item: 400
  },
  {
    whs_id: 'WH001',
    staff_id: 'ST004',
    staff_no: 'EMP004',
    operator_name: 'Pham Thi D',
    operator: 'PTD',
    labor_type_detail: 'vendor',
    grass_date: '2026-01-12',
    start_time: '08:00:00',
    end_time: '17:00:00',
    main_act_name: 'packing',
    main_act_name_pct: 90,
    total_hrs: 9,
    direct_hrs: 8.5,
    ob_direct_hrs: 7.5,
    picking_hrs: 0.5,
    sorting_hrs: 0,
    checking_hrs: 0.5,
    packing_hrs: 7.5,
    shipping_hrs: 0,
    indirect_hrs: 0.3,
    break_hrs: 0.2,
    pick_score_item: 30,
    sort_score_item: 0,
    check_score_item: 40,
    picked_item: 100,
    sorted_item: 0,
    checked_item: 80
  },
  {
    whs_id: 'WH001',
    staff_id: 'ST001',
    staff_no: 'EMP001',
    operator_name: 'Nguyen Van A',
    operator: 'NVA',
    labor_type_detail: 'full-time',
    grass_date: '2026-01-12',
    start_time: '08:00:00',
    end_time: '17:00:00',
    main_act_name: 'picking',
    main_act_name_pct: 68,
    total_hrs: 9,
    direct_hrs: 7.2,
    ob_direct_hrs: 5.8,
    picking_hrs: 5,
    sorting_hrs: 1.2,
    checking_hrs: 1,
    packing_hrs: 0,
    shipping_hrs: 0,
    indirect_hrs: 1.3,
    break_hrs: 0.5,
    pick_score_item: 115,
    sort_score_item: 85,
    check_score_item: 75,
    picked_item: 430,
    sorted_item: 140,
    checked_item: 110
  },
  {
    whs_id: 'WH002',
    staff_id: 'ST005',
    staff_no: 'EMP005',
    operator_name: 'Vo Van E',
    operator: 'VVE',
    labor_type_detail: 'full-time',
    grass_date: '2026-01-13',
    start_time: '08:00:00',
    end_time: '17:00:00',
    main_act_name: 'picking',
    main_act_name_pct: 72,
    total_hrs: 9,
    direct_hrs: 7.8,
    ob_direct_hrs: 6.5,
    picking_hrs: 5.6,
    sorting_hrs: 1.5,
    checking_hrs: 0.7,
    packing_hrs: 0,
    shipping_hrs: 0,
    indirect_hrs: 0.8,
    break_hrs: 0.4,
    pick_score_item: 125,
    sort_score_item: 95,
    check_score_item: 65,
    picked_item: 490,
    sorted_item: 160,
    checked_item: 95
  },
  {
    whs_id: 'WH001',
    staff_id: 'ST002',
    staff_no: 'EMP002',
    operator_name: 'Tran Thi B',
    operator: 'TTB',
    labor_type_detail: 'part-time',
    grass_date: '2026-01-13',
    start_time: '13:00:00',
    end_time: '17:00:00',
    main_act_name: 'sorting',
    main_act_name_pct: 83,
    total_hrs: 4,
    direct_hrs: 3.6,
    ob_direct_hrs: 3.1,
    picking_hrs: 0.4,
    sorting_hrs: 2.7,
    checking_hrs: 0.5,
    packing_hrs: 0,
    shipping_hrs: 0,
    indirect_hrs: 0.3,
    break_hrs: 0.1,
    pick_score_item: 38,
    sort_score_item: 155,
    check_score_item: 48,
    picked_item: 75,
    sorted_item: 300,
    checked_item: 70
  }
];

/**
 * Filter mock data based on query parameters
 * @param {Object} filters - Filter criteria
 * @returns {Array} Filtered data
 */
function filterData(filters = {}) {
  let result = [...mockData];

  // Filter by whs_id
  if (filters.whs_id && filters.whs_id.trim() !== '') {
    result = result.filter(item => 
      item.whs_id.toLowerCase().includes(filters.whs_id.toLowerCase())
    );
  }

  // Filter by staff_id
  if (filters.staff_id && filters.staff_id.trim() !== '') {
    result = result.filter(item => 
      item.staff_id.toLowerCase().includes(filters.staff_id.toLowerCase())
    );
  }

  // Filter by staff_no
  if (filters.staff_no && filters.staff_no.trim() !== '') {
    result = result.filter(item => 
      item.staff_no.toLowerCase().includes(filters.staff_no.toLowerCase())
    );
  }

  // Filter by operator
  if (filters.operator && filters.operator.trim() !== '') {
    result = result.filter(item => 
      item.operator.toLowerCase().includes(filters.operator.toLowerCase()) ||
      item.operator_name.toLowerCase().includes(filters.operator.toLowerCase())
    );
  }

  // Filter by grass_date
  if (filters.grass_date && filters.grass_date.trim() !== '') {
    result = result.filter(item => item.grass_date === filters.grass_date);
  }

  // Filter by date range
  if (filters.start_date && filters.start_date.trim() !== '') {
    result = result.filter(item => item.grass_date >= filters.start_date);
  }

  if (filters.end_date && filters.end_date.trim() !== '') {
    result = result.filter(item => item.grass_date <= filters.end_date);
  }

  return result;
}

module.exports = {
  mockData,
  filterData
};
