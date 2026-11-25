import React, { useState } from 'react';
import { fc1Photos } from '../website/_components/product/fc1-photos';
import { Fc1ColourConfigurator } from '../website/_components/product/fc1-colour-configurator';
import { FoldStatePreview } from '../website/_components/product/fc1-interactions';
import './a1-ultra-immersive.css';

export default function A1UltraImmersiveStory({ lang = 'zh', product, templateBlocks = [] }) {
  const [activeColor, setActiveColor] = useState('green');

  return (
    <div className="a1-story-root">
      {/* 01. 苹果式全屏巨幕发布会首屏：微光呼吸光影 + 纯粹整车 + 交互调色盘 */}
      <section id="hero" className="a1-section a1-hero">
        <div className="a1-hero__stage">
          <Fc1ColourConfigurator
            locale={lang}
            productTitle="ALSVID A1 Ultra"
            productDescription="40 cm 超低跨碳纤维车架 · 机构紧凑折叠 · 前后双避震系统"
          />
        </div>
      </section>

      {/* 02. 大疆级工业核心性能大仪表标杆 (Impact Metrics) */}
      <section className="a1-metrics-bar">
        <div className="a1-metrics-grid">
          <div className="a1-metric-item">
            <strong>40 <small>cm</small></strong>
            <span>超低跨骑几何</span>
          </div>
          <div className="a1-metric-item">
            <strong>15.5 <small>kg</small></strong>
            <span>整车轻量化净重</span>
          </div>
          <div className="a1-metric-item">
            <strong>85 <small>cm</small></strong>
            <span>一键折叠收纳长度</span>
          </div>
          <div className="a1-metric-item">
            <strong>250 <small>W</small></strong>
            <span>平顺后驱静音电机</span>
          </div>
        </div>
      </section>

      {/* 03. 粘性极简章节导航 */}
      <nav className="a1-sticky-nav" aria-label="A1 章节导航">
        <a href="#frame">碳纤车架</a>
        <a href="#folding">紧凑折叠</a>
        <a href="#suspension">双避震系统</a>
        <a href="#drivetrain">平顺动力</a>
        <a href="#cockpit">中控交互</a>
        <a href="#specs">参数规格</a>
      </nav>

      {/* 04. 章节一：全碳纤维低跨车架 —— 巨幅透视图 + 影棚级特写 */}
      <section id="frame" className="a1-section a1-cinema-block">
        <div className="a1-cinema-container">
          <div className="a1-cinema-copy">
            <span className="a1-eyebrow">01 / FRAME GEOMETRY</span>
            <h2>跨上车，<br/>更自由从容。</h2>
            <p>
              全碳纤维一体成型低跨车架，离地高度仅 40 cm。无需费力抬腿跨越横梁，无论是日常通勤还是休闲穿梭，每一次启程与停步都优雅自如。
            </p>
            <div className="a1-pill-badge">超轻碳纤复合材料 · 兼顾刚性与吸震</div>
          </div>
          <div className="a1-cinema-visual">
            <div className="a1-spotlight-frame">
              <img src="/products/fc1/rear-three-quarter-transparent-v3.png" alt="A1 Ultra 后侧视图" loading="lazy" />
            </div>
          </div>
        </div>
      </section>

      {/* 05. 章节二：折叠交互实验室 —— 苹果级折叠动效与激光测距标注 */}
      <section id="folding" className="a1-section a1-fold-lab">
        <div className="a1-fold-container">
          <div className="a1-fold-header">
            <span className="a1-eyebrow">02 / COMPACT FOLDING</span>
            <h2>三步折叠，随处隐形。</h2>
            <p>
              专为现代移动生活而打造的折叠结构。通过精密自锁铰链，数秒内即可将车身收拢至极限尺寸，放进汽车后备箱、搭乘高铁或置于办公室一角。
            </p>
          </div>
          <div className="a1-fold-interactive-stage">
            <FoldStatePreview locale={lang} />
          </div>
        </div>
      </section>

      {/* 06. 章节三：前后双避震工业拆解 —— 影棚级微距悬浮双联卡片 */}
      <section id="suspension" className="a1-section a1-duo-macro">
        <div className="a1-duo-header">
          <span className="a1-eyebrow">03 / DUAL SUSPENSION SYSTEM</span>
          <h2>把路面的颠簸，<br/>在触达身体前化解。</h2>
        </div>
        <div className="a1-duo-grid">
          <div className="a1-macro-card">
            <div className="a1-macro-visual">
              <img src="/products/fc1/hidden-carbon-front-suspension-transparent-v3.png" alt="隐藏式碳纤维前减震" loading="lazy" />
            </div>
            <div className="a1-macro-copy">
              <span className="a1-tag">FRONT</span>
              <h3>隐藏式碳纤维前减震</h3>
              <p>顺着车身轮廓收进前叉内部，保持极致利落的车头线条，同时有效吸收前轮路面细碎震动，减轻手部疲劳。</p>
            </div>
          </div>
          <div className="a1-macro-card">
            <div className="a1-macro-visual">
              <img src="/products/fc1/dnm-rear-air-shock-transparent-v3.png" alt="DNM 后空气减震" loading="lazy" />
            </div>
            <div className="a1-macro-copy">
              <span className="a1-tag">REAR</span>
              <h3>DNM 后空气减震器</h3>
              <p>采用专业级可调气压后阻尼，精确匹配骑行者体重。无论是石板路、减速带还是坑洼路面，提供犹如气垫般平稳贴地感。</p>
            </div>
          </div>
        </div>
      </section>

      {/* 07. 章节四：动力总成与中控座舱 —— 宽幕工业黑调视差 */}
      <section id="drivetrain" className="a1-section a1-cinema-block a1-reverse">
        <div className="a1-cinema-container">
          <div className="a1-cinema-copy">
            <span className="a1-eyebrow">04 / DRIVETRAIN & MOTOR</span>
            <h2>每一次踩踏，<br/>都有平顺随心的回应。</h2>
            <p>
              Shimano 专业 7 速传动系统搭配后轮静音轮毂电机与高敏力矩传感，无需手忙脚乱切换挡位，动力如影随形。
            </p>
            <div className="a1-specs-quick">
              <div><strong>40 Nm</strong><span>爆发扭矩</span></div>
              <div><strong>25 km/h</strong><span>合规切断</span></div>
              <div><strong>力矩传感</strong><span>精准感知</span></div>
            </div>
          </div>
          <div className="a1-cinema-visual">
            <div className="a1-spotlight-frame">
              <img src="/products/fc1/shimano-chain-drivetrain-transparent-v3.png" alt="Shimano 链条与电机传动" loading="lazy" />
            </div>
          </div>
        </div>
      </section>

      {/* 08. 章节五：极简座舱中控 */}
      <section id="cockpit" className="a1-section a1-cockpit-banner">
        <div className="a1-cockpit-content">
          <div className="a1-cockpit-visual">
            <img src="/products/fc1/handlebar-display-transparent-v3.png" alt="车把控制与中置清晰显示屏" loading="lazy" />
          </div>
          <div className="a1-cockpit-copy">
            <span className="a1-eyebrow">05 / COCKPIT CONTROL</span>
            <h2>直觉掌控，一目了然。</h2>
            <p>
              高对比度阳光屏嵌于车把中心，电量、时速、档位实时清晰可见。极简物理按键触手可及，骑行中无需低头分心。
            </p>
          </div>
        </div>
      </section>

      {/* 09. 技术参数与全车主档规格 */}
      <section id="specs" className="a1-section a1-specs-section">
        <div className="a1-specs-container">
          <div className="a1-specs-header">
            <span className="a1-eyebrow">SPECIFICATIONS</span>
            <h2>精工细作 · 技术参数</h2>
          </div>
          <div className="a1-specs-table-wrap">
            <table className="a1-specs-table">
              <tbody>
                <tr><th>车架材质</th><td>全碳纤维复合材料 (一体成型)</td></tr>
                <tr><th>整车净重</th><td>约 15.5 kg (含电池与脚撑)</td></tr>
                <tr><th>折叠尺寸</th><td>850 × 690 × 480 mm</td></tr>
                <tr><th>低跨高度</th><td>400 mm</td></tr>
                <tr><th>电机系统</th><td>250W 36V 后驱无刷轮毂电机</td></tr>
                <tr><th>峰值扭矩</th><td>40 N·m</td></tr>
                <tr><th>动力传感器</th><td>双边力矩传感系统</td></tr>
                <tr><th>变速系统</th><td>Shimano 7 速专业变速套件</td></tr>
                <tr><th>前避震系统</th><td>隐藏式碳纤维前叉液压阻尼</td></tr>
                <tr><th>后避震系统</th><td>DNM 专业级可调气压后减震器</td></tr>
                <tr><th>刹车系统</th><td>前后高精度机械碟刹</td></tr>
                <tr><th>轮组轮胎</th><td>20 英寸城市全地形轻量化外胎</td></tr>
                <tr><th>最高助力时速</th><td>25 km/h (符合欧盟 EN 15194 法规)</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 10. 底部呼吁行动 */}
      <footer className="a1-story-footer">
        <h2>准备好开启你的全新骑行体验了吗？</h2>
        <p>体验 ALSVID A1 Ultra 带来的轻盈与自由，预约您身边的专属门店试骑。</p>
        <div className="a1-footer-actions">
          <a className="a1-btn-primary" href="/www/zh/dealers">寻找全球授权经销商 →</a>
          <a className="a1-btn-secondary" href="#overview">返回配置器选配</a>
        </div>
      </footer>
    </div>
  );
}
