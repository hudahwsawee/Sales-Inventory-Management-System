import { Module } from '@nestjs/common';
import { CategoriesController } from './categories/categories.controller';
import { CategoriesService } from './categories/categories.service';
import { BrandsController } from './brands/brands.controller';
import { BrandsService } from './brands/brands.service';
import { UnitsController } from './units/units.controller';
import { UnitsService } from './units/units.service';
import { ProductsController } from './products/products.controller';
import { ProductsService } from './products/products.service';

/**
 * CatalogModule — يجمع الكيانات المرجعية المرتبطة (Categories, Brands,
 * Units) مع Products نفسها في module واحد، لأن Products يعتمد عليها
 * مباشرة (Foreign Keys) ولا معنى عملي لفصلها في Modules منفصلة الآن.
 * يطابق `apps/catalog/` في Folder Structure المعتمد في System Architecture.
 */
@Module({
  controllers: [CategoriesController, BrandsController, UnitsController, ProductsController],
  providers: [CategoriesService, BrandsService, UnitsService, ProductsService],
  exports: [ProductsService], // قد تحتاجه Modules أخرى مستقبلًا (Sales, Inventory...)
})
export class CatalogModule {}
