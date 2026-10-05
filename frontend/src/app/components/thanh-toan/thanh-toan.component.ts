import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ActivatedRoute, Router } from '@angular/router';
import {
  BillingOrder,
  BillingService,
  RevenueReport,
  SubscriptionPlan,
} from '../../services/billing.service';
import { NotificationService } from '../../services/notification.service';

const ORDER_STATUS_LABEL: Record<BillingOrder['status'], string> = {
  cho_thanh_toan: 'Chờ thanh toán',
  da_thanh_toan: 'Đã thanh toán',
  da_huy: 'Đã hủy',
  het_han: 'Hết hạn',
};

type PlanDraft = { name: string; months: number | null; amount: number | null };
const MAX_PLANS = 6;

/**
 * Trang gói dịch vụ. Admin đặt bảng giá; Trưởng phòng / PHT mua một gói qua
 * PayOS, gia hạn gói cho toàn hệ thống. Cả hai đều xem được lịch sử thanh toán.
 */
@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './thanh-toan.component.html',
  styleUrl: './thanh-toan.component.css',
})
export class BillingComponent implements OnInit {
  private readonly billing = inject(BillingService);
  private readonly notify = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly isAdmin = this.auth.isAdmin();
  readonly canBuy = this.auth.isManager();
  readonly maxPlans = MAX_PLANS;
  /** Bản sao có thể sửa của bảng giá cho admin. */
  readonly drafts = signal<PlanDraft[]>([]);
  readonly savingPlans = signal(false);

  readonly status = this.billing.status;
  readonly plans = signal<SubscriptionPlan[]>([]);
  readonly orders = signal<BillingOrder[]>([]);
  readonly revenue = signal<RevenueReport | null>(null);
  readonly maxMonthly = computed(() =>
    Math.max(1, ...(this.revenue()?.byMonth ?? []).map((m) => m.total)),
  );
  readonly buyingPlan = signal('');
  readonly syncingOrder = signal<number | null>(null);
  readonly statusLabel = ORDER_STATUS_LABEL;

  /** Giá gói 1 tháng, mốc để tính huy hiệu tiết kiệm. */
  private readonly baseMonthly = computed(
    () => this.plans().find((p) => p.months === 1)?.amount ?? 0,
  );

  readonly currentPlanName = computed(() => {
    const s = this.status();
    if (!s) return '';
    return s.isTrial ? 'Dùng thử' : (this.plans().find((p) => p.code === s.plan)?.name ?? s.plan);
  });

  ngOnInit() {
    this.billing.refreshStatus().subscribe();
    this.loadPlans();

    if (this.isAdmin) {
      this.billing.getRevenue().subscribe((r) => this.revenue.set(r));
      return;
    }

    // PayOS đưa người mua về đây kèm ?orderCode=…; không bao giờ tin tham số status của nó —
    // hỏi backend của ta, backend hỏi thẳng PayOS.
    const orderCode = this.route.snapshot.queryParamMap.get('orderCode');
    if (orderCode) {
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
      this.sync(Number(orderCode), true);
    } else {
      this.loadOrders();
    }
  }

  loadPlans() {
    this.billing.getPlans().subscribe((plans) => {
      this.plans.set(plans);
      this.drafts.set(plans.map(({ name, months, amount }) => ({ name, months, amount })));
    });
  }

  addDraft() {
    if (this.drafts().length >= MAX_PLANS) return;
    const used = new Set(this.drafts().map((d) => d.months));
    const months = [1, 3, 6, 12, 24, 36].find((m) => !used.has(m)) ?? null;
    this.drafts.update((list) => [
      ...list,
      { name: months ? `Gói ${months} tháng` : '', months, amount: null },
    ]);
  }

  removeDraft(index: number) {
    this.drafts.update((list) => list.filter((_, i) => i !== index));
  }

  resetDrafts() {
    this.drafts.set(this.plans().map(({ name, months, amount }) => ({ name, months, amount })));
  }

  savePlans() {
    const drafts = this.drafts();
    const invalid = drafts.find(
      (d) => !d.name.trim() || !d.months || d.months < 1 || !d.amount || d.amount < 2000,
    );
    if (!drafts.length || invalid) {
      this.notify.error('Mỗi gói cần tên, số tháng (≥ 1) và giá (≥ 2.000 đ).');
      return;
    }
    this.savingPlans.set(true);
    this.billing
      .savePlans(
        drafts.map((d) => ({
          name: d.name.trim(),
          months: Math.round(Number(d.months)),
          amount: Math.round(Number(d.amount)),
        })),
      )
      .subscribe({
        next: (plans) => {
          this.savingPlans.set(false);
          this.plans.set(plans);
          this.resetDrafts();
          this.notify.success('Đã lưu bảng giá gói dịch vụ.');
        },
        error: (err) => {
          this.savingPlans.set(false);
          this.notify.error(err.error?.message || 'Không lưu được bảng giá');
        },
      });
  }

  loadOrders() {
    this.billing.getOrders().subscribe((orders) => this.orders.set(orders));
  }

  buy(plan: SubscriptionPlan) {
    this.buyingPlan.set(plan.code);
    this.billing.createOrder(plan.code).subscribe({
      next: (res) => (window.location.href = res.checkoutUrl), // Trang PayOS có mã QR
      error: (err) => {
        this.buyingPlan.set('');
        this.notify.error(err.error?.message || 'Không tạo được liên kết thanh toán');
      },
    });
  }

  sync(orderCode: number, fromReturn = false) {
    this.syncingOrder.set(orderCode);
    this.billing.syncOrder(orderCode).subscribe({
      next: ({ order }) => {
        this.syncingOrder.set(null);
        this.loadOrders();
        if (order.status === 'da_thanh_toan')
          this.notify.success(
            `Thanh toán thành công! Gói sử dụng được gia hạn tới ${new Date(order.extendedTo!).toLocaleDateString('vi-VN')}.`,
          );
        else if (fromReturn && order.status === 'cho_thanh_toan')
          this.notify.info(
            'Chưa nhận được thanh toán cho đơn này. Nếu bạn đã chuyển khoản, bấm "Kiểm tra lại" sau ít phút.',
          );
        else if (fromReturn) this.notify.info(`Đơn thanh toán: ${this.statusLabel[order.status]}.`);
      },
      error: (err) => {
        this.syncingOrder.set(null);
        this.loadOrders();
        this.notify.error(err.error?.message || 'Không kiểm tra được trạng thái thanh toán');
      },
    });
  }

  /** "Tiết kiệm 10%" so với trả theo từng tháng. */
  savingPercent(plan: SubscriptionPlan): number {
    const full = this.baseMonthly() * plan.months;
    return full > plan.amount ? Math.round((1 - plan.amount / full) * 100) : 0;
  }

  perMonth(plan: SubscriptionPlan): number {
    return Math.round(plan.amount / plan.months);
  }

  formatVnd(amount: number): string {
    return amount.toLocaleString('vi-VN') + ' đ';
  }
}
