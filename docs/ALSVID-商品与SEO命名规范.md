# ALSVID 商品与 SEO 命名规范

版本：V1.0  
适用范围：产品主档、商城商品装修、生产订单、B2B 分销、仓储库存和对外商城页面

## 一、唯一识别原则

ALSVID 不再维护第二套人工商品编号。

- 数据库 UUID：仅作为系统内部技术主键，不展示给运营人员，不参与 SEO 命名。
- SEO 商品 ID：就是主市场的 SEO Slug，同时作为商城商品页面的业务识别入口。
- SKU：只负责具体规格、颜色、市场法规、库存、订单和履约。
- 产品型号：用于产品主档识别，例如 A1、A1 Ultra、L1、L1 PRO，不替代 SEO 商品 ID。

一个商品只有一套业务识别体系：SEO 商品 ID。不能同时再增加“商品编号”“业务 ID”“默认商品 ID”等重复字段。

## 二、SEO 命名规则

命名优先级：

1. 核心搜索品类词
2. 关键产品属性
3. 真实存在的差异化卖点
4. 产品型号放在末尾

推荐公式：

```text
核心品类词-关键属性-真实差异化卖点-产品型号
```

公式是推荐规则，不要求为了完整而堆砌关键词。产品没有真实属性或搜索价值的词不能写入 SEO ID。

SEO ID 规则：

- 只使用小写英文字母、数字和短横线。
- 单词之间使用一个短横线。
- 不使用中文、空格、下划线、特殊符号和 SKU 颜色编码。
- 同一市场、同一语言下必须唯一。
- 发布后默认锁定；如需修改，必须保留旧地址并建立永久跳转。

## 三、德国市场首批四款整车

| 产品 | SEO 商品 ID / URL Slug | Google SEO Title | 物理 SKU |
|---|---|---|---|
| ALSVID A1 | `carbon-e-bike-klapprad-a1` | `20 Zoll Carbon E-Bike Klapprad | ALSVID A1` | `A1-STD-PUR-EUR` |
| ALSVID A1 Ultra | `carbon-e-bike-klapprad-a1-ultra` | `20 Zoll Carbon E-Bike Klapprad | ALSVID A1 Ultra` | `A1-ULT-GRY-EUR` |
| ALSVID L1 | `carbon-e-bike-klapprad-l1` | `20 Zoll Carbon E-Bike Klapprad | ALSVID L1` | `L1-STD-PUR-EUR` |
| ALSVID L1 PRO | `carbon-e-bike-klapprad-mittelmotor-l1-pro` | `20 Zoll Carbon E-Bike Klapprad mit Mittelmotor | ALSVID L1 Pro` | `L1-PRO-GRY-EUR` |

后续商品沿用德国市场优先、简洁可读的命名原则：选取真实的核心品类、必要的差异化属性与型号，不强制在 ID 中包含尺寸；尺寸可写入标题和详情。其他市场暂沿用同一商品 ID，分别维护当地语言内容和价格。生成建议须经人工核对；SKU、订单和库存继续使用稳定的内部关联。

德国商城路径统一为：

```text
/de/e-bikes/{seo商品ID}
```

## 四、多语言规则

不同市场可以使用不同的本地化 SEO ID，但必须关联同一个内部商品主档：

- 德国：`de-DE`
- 奥地利：`de-AT`
- 英国：`en-GB`
- 法国：`fr-FR`
- 荷兰：`nl-NL`

每个语言页面使用自己的 Canonical，并通过 hreflang 互相关联。不能让所有语言页面统一指向德国页面。

## 五、SKU 规则

SKU 继续使用四段式编码，例如：

```text
A1-ULT-GRY-EUR
```

四段分别表示车型代际、配置版本、外观颜色和市场法规。SKU 不进入 SEO 商品 ID，不作为商城商品主链接。

## 六、系统执行规则

- 产品编辑页维护产品名称、型号、技术资料和 SKU，不新增独立商品 ID字段。
- 商品装修页维护 SEO 商品 ID / URL Slug、SEO Title、SEO 描述、关键词和 Canonical。
- 新建商城商品时，根据已确定的产品型号和真实属性生成 SEO Slug 建议，运营人员确认后保存。
- 首页、商品列表、B2B 商品入口统一跳转到 SEO 商品 URL，不直接暴露 UUID。
- 商品 URL 只使用 SEO 商品 ID；UUID 不作为商城公开入口。
- 修改商品 SEO 商品 ID 时，直接以新规则替换旧商城入口，不保留旧入口。
- 历史订单、库存、VIN、BOM、生产和售后记录只关联内部 UUID，不因 SEO 修改而变化。
- 商品归档或停用，不物理删除主档和历史 URL。

## 七、禁止事项

- 禁止新增一套独立数字商品编号。
- 禁止把 SKU 当成商品主档 ID。
- 禁止把 SEO Slug 当成数据库永久主键。
- 禁止在产品主档、订单、库存、VIN、BOM 等内部数据中改写 UUID 关联。
- 禁止使用未核实的产品卖点或关键词填充 SEO ID。

