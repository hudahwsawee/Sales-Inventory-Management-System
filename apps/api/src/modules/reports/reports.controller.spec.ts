import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

function buildController(getExportRowsResult = { rows: [{ a: 1 }], filename: 'test' }) {
  const service = {
    getExportRows: jest.fn(async () => getExportRowsResult),
  } as unknown as ReportsService;
  const controller = new ReportsController(service);
  return { controller, service };
}

function fakeResponse() {
  return { setHeader: jest.fn(), send: jest.fn() } as any;
}

describe('ReportsController — تفويض التصدير (Step 7 §17/§23)', () => {
  it('يرفض تصدير بيانات مبيعات لمستخدم يملك reports.export فقط بلا reports.sales', async () => {
    const { controller } = buildController();
    const user = { userId: 'u1', username: 'x', permissions: ['reports.export'] }; // بلا reports.sales

    await expect(
      controller.export('sales-trend', {} as any, user, fakeResponse()),
    ).rejects.toThrow(ForbiddenException);
  });

  it('ينجح التصدير عندما يملك المستخدم كلا الصلاحيتين معًا', async () => {
    const { controller, service } = buildController();
    const user = { userId: 'u1', username: 'x', permissions: ['reports.export', 'reports.sales'] };
    const res = fakeResponse();

    await controller.export('sales-trend', {} as any, user, res);

    expect(service.getExportRows).toHaveBeenCalledWith('sales-trend', {});
    expect(res.send).toHaveBeenCalled();
  });

  it('يرفض نوع تصدير غير معروف', async () => {
    const { controller } = buildController();
    const user = { userId: 'u1', username: 'x', permissions: ['reports.export', 'reports.sales', 'reports.profit'] };

    await expect(
      controller.export('not-a-real-type', {} as any, user, fakeResponse()),
    ).rejects.toThrow(BadRequestException);
  });

  it('لا يكفي امتلاك reports.profit وحدها لتصدير بيانات مخزون — يجب reports.inventory تحديدًا', async () => {
    const { controller } = buildController();
    const user = { userId: 'u1', username: 'x', permissions: ['reports.export', 'reports.profit'] };

    await expect(
      controller.export('inventory-items', {} as any, user, fakeResponse()),
    ).rejects.toThrow(ForbiddenException);
  });
});
