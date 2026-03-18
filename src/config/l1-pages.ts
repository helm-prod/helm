export interface PageConfig {
  label: string
  url: string
  aorOwner?: string
  depth: number
  parentLabel?: string
  isDynamic?: boolean
}

export const L1_PAGES: PageConfig[] = [
  { label: 'Homepage', url: 'https://www.mynavyexchange.com', aorOwner: 'Megan', depth: 0 },
  { label: 'Military', url: 'https://www.mynavyexchange.com/browse/military/_/N-1413539776', aorOwner: 'Maddie', depth: 1 },
  { label: "Men's", url: 'https://www.mynavyexchange.com/browse/men-s/_/N-380633284', aorOwner: 'Megan', depth: 1 },
  { label: "Women's", url: 'https://www.mynavyexchange.com/browse/women-s/_/N-459937891', aorOwner: 'Megan', depth: 1 },
  { label: 'Kids', url: 'https://www.mynavyexchange.com/browse/apparel/kids-apparel/_/N-469120406', aorOwner: 'Megan', depth: 1 },
  { label: 'Baby', url: 'https://www.mynavyexchange.com/browse/kids/_/N-816291448', aorOwner: 'Maddie', depth: 1 },
  { label: 'Accessories', url: 'https://www.mynavyexchange.com/browse/accessories/_/N-3390284235', aorOwner: 'Daryl', depth: 1 },
  { label: 'Shoes', url: 'https://www.mynavyexchange.com/browse/shoes/_/N-2611111227', aorOwner: 'Maddie', depth: 1 },
  { label: 'Beauty', url: 'https://www.mynavyexchange.com/browse/beauty/_/N-3719489590', aorOwner: 'Maddie', depth: 1 },
  { label: 'Personal Care', url: 'https://www.mynavyexchange.com/browse/personal-care/_/N-879452703', aorOwner: 'Maddie', depth: 1 },
  { label: 'Electronics', url: 'https://www.mynavyexchange.com/browse/electronics/_/N-2540394923', aorOwner: 'Daryl', depth: 1 },
  { label: 'Everyday Home', url: 'https://www.mynavyexchange.com/browse/everyday-home/_/N-3389903099', aorOwner: 'Maddie', depth: 1 },
  { label: 'Furniture', url: 'https://www.mynavyexchange.com/browse/furniture/_/N-3183556638', aorOwner: 'Maddie', depth: 1 },
  { label: 'Outdoor Home', url: 'https://www.mynavyexchange.com/browse/outdoor-home/_/N-3084580992', aorOwner: 'Maddie', depth: 1 },
  { label: 'Sports, Fitness & Outdoors', url: 'https://www.mynavyexchange.com/browse/fitness/_/N-1055229383', aorOwner: 'Megan', depth: 1 },
  { label: 'Office & School Supplies', url: 'https://www.mynavyexchange.com/browse/office-school-supplies/_/N-3714973793', aorOwner: 'Daryl', depth: 1 },
  { label: 'Luggage & Travel', url: 'https://www.mynavyexchange.com/browse/luggage-travel/_/N-300808423', aorOwner: 'Daryl', depth: 1 },
  { label: 'Toys', url: 'https://www.mynavyexchange.com/browse/_/N-942274772', aorOwner: 'Daryl', depth: 1 },
  { label: 'Household Essentials', url: 'https://www.mynavyexchange.com/browse/_/N-3864213259', aorOwner: 'Megan', depth: 1 },
  { label: 'Health & Wellness', url: 'https://www.mynavyexchange.com/browse/_/N-513134447', aorOwner: 'Megan', depth: 1 },
  { label: 'Pet', url: 'https://www.mynavyexchange.com/browse/_/N-1226486567', aorOwner: 'Maddie', depth: 1 },
  { label: 'General Hardware', url: 'https://www.mynavyexchange.com/browse/general-hardware/_/N-4211009183', aorOwner: 'Daryl', depth: 1 },
  { label: 'Food, Snacks & Candy', url: 'https://www.mynavyexchange.com/browse/_/N-328199723', aorOwner: 'Daryl', depth: 1 },
]
