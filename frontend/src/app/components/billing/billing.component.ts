import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { BillingOrder, BillingService, SubscriptionPlan } from '../../services/billing.service';
import { NotificationService } from '../../services/notification.service';

const ORDER_STATUS_LABEL: Record<BillingOrder['status'], string> = {
  cho_thanh_toan: 'Chờ thanh toán',
  da_thanh_toan: 'Đã thanh toán',
  da_huy: 'Đã hủy',
  het_han: 'Hết hạn',
};

const ORDER_STATUS_TONE: Record<BillingOrder['status'], string> = {
  cho_thanh_toan: 'bg-amber-50 text-amber-700 border-amber-200',
  da_thanh_toan: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  da_huy: 'bg-slate-100 text-slate-600 border-slate-200',
  het_han: 'bg-slate-100 text-slate-600 border-slate-200',
};

/** Admin page: current subscription, plan purchase through PayOS and payment history. */
@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './billing.component.html',
})
export class BillingComponent implements OnInit {
  private readonly billing = inject(BillingService);
  private readonly notify = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly status = this.billing.status;
  readonly plans = signal<SubscriptionPlan[]>([]);
  readonly orders = signal<BillingOrder[]>([]);
  readonly buyingPlan = signal('');
  readonly syncingOrder = signal<number | null>(null);
  readonly statusLabel = ORDER_STATUS_LABEL;
  readonly statusTone = ORDER_STATUS_TONE;

  /** Price of the 1-month plan, the baseline for the savings badge. */
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
    this.billing.getPlans().subscribe((plans) => this.plans.set(plans));

    // PayOS sends the buyer back here with ?orderCode=…; never trust its status param —
    // ask our backend, which asks PayOS directly.
    const orderCode = this.route.snapshot.queryParamMap.get('orderCode');
    if (orderCode) {
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
      this.sync(Number(orderCode), true);
    } else {
      this.loadOrders();
    }
  }

  loadOrders() {
    this.billing.getOrders().subscribe((orders) => this.orders.set(orders));
  }

  buy(plan: SubscriptionPlan) {
    this.buyingPlan.set(plan.code);
    this.billing.createOrder(plan.code).subscribe({
      next: (res) => (window.location.href = res.checkoutUrl), // PayOS hosted page with QR
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

  /** "Tiết kiệm 10%" compared with paying month by month. */
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
