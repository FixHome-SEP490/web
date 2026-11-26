// Hẹn lên trụ sở sau khi quản lý dịch vụ xác nhận danh tính (PO 09/11/2026). Cùng hợp đồng bản mobile: `technicians/me/office-visit`.
import apiClient from './client';

export interface OfficeSlot {
  /** ISO, đầu lượt hẹn. */
  startsAt: string;
  remaining: number;
}

export interface VisitOfficeOption {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  /** Null khi chưa biết vị trí của thợ hoặc trụ sở. */
  distanceKm: number | null;
  /** Trụ sở gần nhất. */
  recommended: boolean;
  slots: OfficeSlot[];
}

export interface CurrentOfficeVisit {
  id: string;
  officeId: string;
  officeName: string;
  officeAddress: string;
  officePhone: string | null;
  scheduledAt: string;
  status: string;
}

export interface MyOfficeVisit {
  canBook: boolean;
  blocked: boolean;
  missedVisits: number;
  maxMissedVisits: number;
  supportPhone: string | null;
  current: CurrentOfficeVisit | null;
  offices: VisitOfficeOption[];
}

export const technicianOfficeVisitApi = {
  async getMine(): Promise<MyOfficeVisit> {
    const res = await apiClient.get<{ data: MyOfficeVisit }>('/technicians/me/office-visit');
    return res.data.data;
  },
  async book(officeId: string, scheduledAt: string): Promise<CurrentOfficeVisit> {
    const res = await apiClient.post<{ data: CurrentOfficeVisit }>('/technicians/me/office-visit', { officeId, scheduledAt });
    return res.data.data;
  },
};
