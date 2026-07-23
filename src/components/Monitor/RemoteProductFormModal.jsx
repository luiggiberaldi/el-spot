import React, { useEffect, useState } from 'react';
import ProductFormModal from '../Products/ProductFormModal';
import { useProductForm } from '../../hooks/useProductForm';
import { useProductContext } from '../../context/ProductContext';
import { buildProductPayload } from '../../utils/productProcessor';
import { showToast } from '../Toast';

export default function RemoteProductFormModal({ isOpen, onClose, editingProduct, onSubmit, effectiveRate: propEffectiveRate }) {
    const { 
        categories, rates, copEnabled, copPrimary, tasaCop, 
        effectiveRate: ctxEffectiveRate, bcvMarginPct 
    } = useProductContext();

    const effectiveRate = propEffectiveRate || ctxEffectiveRate || rates?.bcv?.price || 1;
    const bcvRate = rates?.bcv?.price || effectiveRate;

    const form = useProductForm();
    const [priceCop, setPriceCop] = useState('');
    const [unitPriceCop, setUnitPriceCop] = useState('');
    const [costCop, setCostCop] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (editingProduct) {
                form.populateForm(editingProduct, effectiveRate, bcvRate);
                if (copEnabled && tasaCop > 0) {
                    if (editingProduct.priceCop != null && editingProduct.priceCop > 0) {
                        setPriceCop(editingProduct.priceCop.toString());
                    } else if (editingProduct.priceUsdt > 0) {
                        setPriceCop(Math.round(editingProduct.priceUsdt * tasaCop).toString());
                    } else {
                        setPriceCop('');
                    }

                    if (editingProduct.unitPriceCop != null && editingProduct.unitPriceCop > 0) {
                        setUnitPriceCop(editingProduct.unitPriceCop.toString());
                    } else if (editingProduct.unitPriceUsd > 0) {
                        setUnitPriceCop(Math.round(editingProduct.unitPriceUsd * tasaCop).toString());
                    } else {
                        setUnitPriceCop('');
                    }

                    if (editingProduct.costUsd > 0) {
                        setCostCop(Math.round(editingProduct.costUsd * tasaCop).toString());
                    } else {
                        setCostCop('');
                    }
                }
            } else {
                form.resetForm();
                setPriceCop('');
                setUnitPriceCop('');
                setCostCop('');
            }
        }
    }, [isOpen, editingProduct]);

    if (!isOpen) return null;

    // Price change handlers
    const handlePriceUsdChange = (val) => {
        form.setPriceUsd(val);
        const parsed = parseFloat(val);
        if (!isNaN(parsed) && parsed > 0) {
            form.setPriceBs((parsed * effectiveRate).toFixed(2));
            if (copEnabled && tasaCop > 0) {
                setPriceCop(Math.round(parsed * tasaCop).toString());
            }
        } else {
            form.setPriceBs('');
            setPriceCop('');
        }
    };

    const handlePriceBsChange = (val) => {
        form.setPriceBs(val);
        const parsed = parseFloat(val);
        if (!isNaN(parsed) && parsed > 0 && effectiveRate > 0) {
            const usd = parsed / effectiveRate;
            form.setPriceUsd(usd.toFixed(4));
            if (copEnabled && tasaCop > 0) {
                setPriceCop(Math.round(usd * tasaCop).toString());
            }
        } else {
            form.setPriceUsd('');
            setPriceCop('');
        }
    };

    const handlePriceCopChange = (val) => {
        setPriceCop(val);
        const parsedCop = parseFloat(val);
        if (!isNaN(parsedCop) && parsedCop > 0 && tasaCop > 0) {
            const usd = parsedCop / tasaCop;
            form.setPriceUsd(usd.toFixed(4));
            form.setPriceBs((usd * effectiveRate).toFixed(2));
        } else if (!val) {
            form.setPriceUsd('');
            form.setPriceBs('');
        }
    };

    const handleCostUsdChange = (val) => {
        form.setCostUsd(val);
        const parsed = parseFloat(val);
        if (!isNaN(parsed) && parsed > 0) {
            form.setCostBs((parsed * effectiveRate).toFixed(2));
            if (copEnabled && tasaCop > 0) {
                setCostCop(Math.round(parsed * tasaCop).toString());
            }
        } else {
            form.setCostBs('');
            setCostCop('');
        }
    };

    const handleCostBsChange = (val) => {
        form.setCostBs(val);
        const parsed = parseFloat(val);
        if (!isNaN(parsed) && parsed > 0 && effectiveRate > 0) {
            const usd = parsed / effectiveRate;
            form.setCostUsd(usd.toFixed(4));
            if (copEnabled && tasaCop > 0) {
                setCostCop(Math.round(usd * tasaCop).toString());
            }
        } else {
            form.setCostUsd('');
            setCostCop('');
        }
    };

    const handleCostCopChange = (val) => {
        setCostCop(val);
        const parsedCop = parseFloat(val);
        if (!isNaN(parsedCop) && parsedCop > 0 && tasaCop > 0) {
            const usd = parsedCop / tasaCop;
            form.setCostUsd(usd.toFixed(4));
            form.setCostBs((usd * effectiveRate).toFixed(2));
        } else if (!val) {
            form.setCostUsd('');
            form.setCostBs('');
        }
    };

    const handlePrice2UsdChange = (val) => {
        form.setPrice2Usd(val);
        const parsed = parseFloat(val);
        if (!isNaN(parsed) && parsed > 0) {
            form.setPrice2Bs((parsed * bcvRate).toFixed(2));
        } else {
            form.setPrice2Bs('');
        }
    };

    const handlePrice2BsChange = (val) => {
        form.setPrice2Bs(val);
        const parsed = parseFloat(val);
        if (!isNaN(parsed) && parsed > 0 && bcvRate > 0) {
            form.setPrice2Usd((parsed / bcvRate).toFixed(4));
        } else {
            form.setPrice2Usd('');
        }
    };

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                showToast('La imagen excede los 5MB', 'warning');
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                form.setImage(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async () => {
        if (!form.name || (!form.priceUsd && !form.priceBs)) {
            form.setIsFormShaking(true);
            setTimeout(() => form.setIsFormShaking(false), 500);
            return showToast('Nombre y precio requeridos', 'warning');
        }

        const productData = buildProductPayload({
            name: form.name,
            barcode: form.barcode,
            priceUsd: form.priceUsd,
            priceBs: form.priceBs,
            priceCop,
            costUsd: form.costUsd,
            costBs: form.costBs,
            stock: form.stock,
            stockInLotes: form.stockInLotes,
            packagingType: form.packagingType,
            unitsPerPackage: form.unitsPerPackage,
            granelUnit: form.granelUnit,
            sellByUnit: form.sellByUnit,
            unitPriceUsd: form.unitPriceUsd,
            unitPriceCop,
            category: form.category,
            lowStockAlert: form.lowStockAlert,
            hasWarranty: form.hasWarranty,
            warrantyDays: form.warrantyDays,
            price2Usd: form.price2Usd
        }, effectiveRate);

        if (form.image !== undefined) {
            productData.image = form.image;
        }

        const productId = editingProduct?.id || crypto.randomUUID();
        const action = editingProduct ? 'edit' : 'add';

        await onSubmit(action, productId, productData);
        form.resetForm();
        onClose();
    };

    return (
        <ProductFormModal
            isOpen={isOpen}
            onClose={onClose}
            isEditing={Boolean(editingProduct)}
            image={form.image}
            setImage={form.setImage}
            name={form.name}
            setName={form.setName}
            barcode={form.barcode}
            setBarcode={form.setBarcode}
            category={form.category}
            setCategory={form.setCategory}
            unit={form.unit}
            setUnit={form.setUnit}
            priceUsd={form.priceUsd}
            handlePriceUsdChange={handlePriceUsdChange}
            priceBs={form.priceBs}
            handlePriceBsChange={handlePriceBsChange}
            priceCop={priceCop}
            handlePriceCopChange={handlePriceCopChange}
            costUsd={form.costUsd}
            handleCostUsdChange={handleCostUsdChange}
            costBs={form.costBs}
            handleCostBsChange={handleCostBsChange}
            costCop={costCop}
            handleCostCopChange={handleCostCopChange}
            stock={form.stock}
            setStock={form.setStock}
            lowStockAlert={form.lowStockAlert}
            setLowStockAlert={form.setLowStockAlert}
            unitsPerPackage={form.unitsPerPackage}
            setUnitsPerPackage={form.setUnitsPerPackage}
            sellByUnit={form.sellByUnit}
            setSellByUnit={form.setSellByUnit}
            unitPriceUsd={form.unitPriceUsd}
            setUnitPriceUsd={form.setUnitPriceUsd}
            unitPriceCop={unitPriceCop}
            setUnitPriceCop={setUnitPriceCop}
            packagingType={form.packagingType}
            setPackagingType={form.setPackagingType}
            stockInLotes={form.stockInLotes}
            setStockInLotes={form.setStockInLotes}
            granelUnit={form.granelUnit}
            setGranelUnit={form.setGranelUnit}
            hasWarranty={form.hasWarranty}
            setHasWarranty={form.setHasWarranty}
            warrantyDays={form.warrantyDays}
            setWarrantyDays={form.setWarrantyDays}
            price2Usd={form.price2Usd}
            handlePrice2UsdChange={handlePrice2UsdChange}
            price2Bs={form.price2Bs}
            handlePrice2BsChange={handlePrice2BsChange}
            effectiveRate={effectiveRate}
            bcvRate={bcvRate}
            bcvMarginPct={bcvMarginPct}
            rates={rates}
            copEnabled={copEnabled}
            copPrimary={copPrimary}
            tasaCop={tasaCop}
            isFormShaking={form.isFormShaking}
            handleImageUpload={handleImageUpload}
            handleSave={handleSave}
            categories={categories}
            productMovements={null}
        />
    );
}
