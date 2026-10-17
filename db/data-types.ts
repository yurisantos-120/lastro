export const recordKinds = ['general', 'vlan', 'camera', 'point'] as const;
export type RecordKind = (typeof recordKinds)[number];

export interface RecordDetails {
  [key: string]: string | undefined;
  vlanNumber?: string;
  neighborhood?: string;
  camera?: string;
  alternateIdentifier?: string;
  address?: string;
  reference?: string;
  geolocation?: string;
  olt?: string;
  description?: string;
  signal?: string;
  serialNumber?: string;
  location?: string;
  speed?: string;
  date?: string;
  partner?: string;
  provider?: string;
  ip?: string;
  dhcpInternal?: string;
  onu?: string;
  onuIdentifier?: string;
  macAddress?: string;
  connectionPort?: string;
  opticalSignal?: string;
  activationDate?: string;
  installationTechnician?: string;
  ipAddress?: string;
  tunnelIp?: string;
  eoipId?: string;
}

export interface CategoryInput {
  name: string;
  description: string;
  color: string;
  scope: RecordKind;
}

export type CategoryCreateInput = CategoryInput;
export type CategoryUpdateInput = CategoryInput & { id: number; revision: number };

export interface RecordInput {
  title: string;
  categoryId: number;
  responsible: string;
  validation: string;
  contact: string;
  notes: string;
  recordType: RecordKind;
  details: RecordDetails;
}

export type RecordCreateInput = RecordInput;
export type RecordUpdateInput = RecordInput & { id: number; revision: number };

export interface VersionedCategory extends CategoryInput { id: number; revision: number }
export interface VersionedRecord extends RecordInput { id: number; revision: number; updated: string }
