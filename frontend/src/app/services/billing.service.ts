import { API_BASE_URL } from '../config/api';
import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export interface SubscriptionStatus {
  expiresAt: string;
  plan: string;
  isTrial: boolean;
  active: boolean;
  daysLeft: number;
  payosConfigured: boolean;
}

export interface SubscriptionPlan {
  code: string;
  name: string;
  months: number;
  amount: number;
}

export interface BillingOrder {
  _id: string;
  orderCode: number;
  planCode: string;
  planName: string;
  months: number;
  amount: number;
  status: 'cho_thanh_toan' | 'da_thanh_toan' | 'da_huy' | 'het_han';
  checkoutUrl: string;
  createdBy?: { fullName: string; email: string };
  paidAt?: string | null;
  reference?: string;
  extendedTo?: string | null;
  createdAt: string;
}

export interface RevenueReport {
  total: number;
  count: number;
  byMonth: { month: string; total: number; count: number }[];
  byPlan: { plan: string; total: number; count: number }[];
  recent: (BillingOrder & { kind?: 'system' | 'account' })[];
}

/** Subscription ("gói sử dụng") paid through PayOS. */
@Injectable({ providedIn: 'root' })
export class BillingService {
  private readonly apiUrl = inject(API_BASE_URL) + '/billing';
  private readonly http = inject(HttpClient);

  /** Trạng thái mới nhất đã biết, dùng chung cho banner sidebar và trang thanh toán. */
  readonly status = signal<SubscriptionStatus | null>(null);

  refreshStatus(): Observable<SubscriptionStatus> {
    return this.http
      .get<SubscriptionStatus>(`${this.apiUrl}/status`)
      .pipe(tap((status) => this.status.set(status)));
  }

  getPlans(): Observable<SubscriptionPlan[]> {
    return this.http.get<SubscriptionPlan[]>(`${this.apiUrl}/plans`);
  }

  /** Admin: thay bảng giá; mã gói theo số tháng. */
  savePlans(plans: Omit<SubscriptionPlan, 'code'>[]): Observable<SubscriptionPlan[]> {
    return this.http.put<SubscriptionPlan[]>(`${this.apiUrl}/plans`, { plans });
  }

  getOrders(): Observable<BillingOrder[]> {
    return this.http.get<BillingOrder[]>(`${this.apiUrl}/orders`);
  }

  /** Admin: doanh thu từ mọi đơn đã thanh toán. */
  getRevenue(): Observable<RevenueReport> {
    return this.http.get<RevenueReport>(`${this.apiUrl}/revenue`);
  }

  createOrder(planCode: string): Observable<{ orderCode: number; checkoutUrl: string }> {
    return this.http.post<{ orderCode: number; checkoutUrl: string }>(`${this.apiUrl}/orders`, {
      planCode,
    });
  }

  syncOrder(
    orderCode: number | string,
  ): Observable<{ order: BillingOrder; subscription: SubscriptionStatus }> {
    return this.http
      .post<{
        order: BillingOrder;
        subscription: SubscriptionStatus;
      }>(`${this.apiUrl}/orders/${orderCode}/sync`, {})
      .pipe(tap((res) => this.status.set({ ...this.status()!, ...res.subscription })));
  }
}
