# Flutter 迁移指南 - 路由状态管理系统

## 概述

本文档说明如何将当前 SXML Web 项目的路由状态管理系统迁移到 Flutter 应用。

## 核心架构对比

| 功能 | SXML (Web) | Flutter |
|------|------------|---------|
| 状态管理 | `setData` + 响应式 Proxy | Provider / Riverpod / Bloc |
| 路由管理 | 手动 `activateTab` | GoRouter / Navigator 2.0 |
| 持久化 | sessionStorage / localStorage | SharedPreferences / Hive |
| API 调用 | superAPI + AES 加密 | Dio + Interceptors |
| 页面切换 | CSS Transform | PageView / TabBarView |

## 完整实现代码

### 1. 路由状态数据模型

```dart
// lib/models/route_state.dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'route_state.freezed.dart';
part 'route_state.g.dart';

@freezed
class RouteState with _$RouteState {
  const factory RouteState({
    @Default('home') String page,
    @Default('capital') String tradesPanel,
    @Default('capital') String fundsPanel,
    String? subPage,
    Map<String, dynamic>? subPageParams,
    @Default(0) int timestamp,
  }) = _RouteState;

  factory RouteState.fromJson(Map<String, dynamic> json) =>
      _$RouteStateFromJson(json);
}
```

### 2. 路由状态管理器

```dart
// lib/services/route_state_manager.dart
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/route_state.dart';

class RouteStateManager {
  static const String _key = 'webapp_route_state_v1';
  static const Duration _ttl = Duration(hours: 24);
  
  // 保存路由状态
  static Future<void> save(RouteState state) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final data = state.copyWith(
        timestamp: DateTime.now().millisecondsSinceEpoch,
      );
      await prefs.setString(_key, jsonEncode(data.toJson()));
      print('[RouteState] 已保存: $data');
    } catch (e) {
      print('[RouteState] 保存失败: $e');
    }
  }
  
  // 加载路由状态
  static Future<RouteState?> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key);
      if (raw == null) return null;
      
      final data = RouteState.fromJson(jsonDecode(raw));
      
      // 检查有效期
      final age = DateTime.now().millisecondsSinceEpoch - data.timestamp;
      if (age > _ttl.inMilliseconds) {
        await clear();
        return null;
      }
      
      print('[RouteState] 已加载: $data');
      return data;
    } catch (e) {
      print('[RouteState] 加载失败: $e');
      return null;
    }
  }
  
  // 清除路由状态
  static Future<void> clear() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_key);
      print('[RouteState] 已清除');
    } catch (e) {
      print('[RouteState] 清除失败: $e');
    }
  }
  
  // 更新部分字段
  static Future<void> update(Map<String, dynamic> updates) async {
    final current = await load() ?? const RouteState();
    final updated = RouteState(
      page: updates['page'] ?? current.page,
      tradesPanel: updates['tradesPanel'] ?? current.tradesPanel,
      fundsPanel: updates['fundsPanel'] ?? current.fundsPanel,
      subPage: updates['subPage'] ?? current.subPage,
      subPageParams: updates['subPageParams'] ?? current.subPageParams,
    );
    await save(updated);
  }
}
```

### 3. 全局状态管理（使用 Riverpod）

```dart
// lib/providers/route_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/route_state.dart';
import '../services/route_state_manager.dart';

// 路由状态 Provider
final routeStateProvider = StateNotifierProvider<RouteStateNotifier, RouteState>(
  (ref) => RouteStateNotifier(),
);

class RouteStateNotifier extends StateNotifier<RouteState> {
  RouteStateNotifier() : super(const RouteState()) {
    _init();
  }
  
  // 初始化：从持久化存储恢复
  Future<void> _init() async {
    final saved = await RouteStateManager.load();
    if (saved != null) {
      state = saved;
    }
  }
  
  // 切换页面
  Future<void> changePage(String page) async {
    state = state.copyWith(page: page);
    await RouteStateManager.save(state);
  }
  
  // 切换 Trades 面板
  Future<void> changeTradesPanel(String panel) async {
    state = state.copyWith(
      page: 'trades',
      tradesPanel: panel,
    );
    await RouteStateManager.save(state);
  }
  
  // 切换 Funds 面板
  Future<void> changeFundsPanel(String panel) async {
    state = state.copyWith(
      page: 'funds',
      fundsPanel: panel,
    );
    await RouteStateManager.save(state);
  }
  
  // 打开子页面
  Future<void> openSubPage(String subPage, Map<String, dynamic>? params) async {
    state = state.copyWith(
      subPage: subPage,
      subPageParams: params,
    );
    await RouteStateManager.save(state);
  }
  
  // 关闭子页面
  Future<void> closeSubPage() async {
    state = state.copyWith(
      subPage: null,
      subPageParams: null,
    );
    await RouteStateManager.save(state);
  }
}
```

### 4. 路由配置（使用 GoRouter）

```dart
// lib/router/app_router.dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../services/route_state_manager.dart';
import '../pages/home_page.dart';
import '../pages/markets_page.dart';
import '../pages/trades_page.dart';
import '../pages/funds_page.dart';
import '../pages/deposit_page.dart';

class AppRouter {
  static Future<String> getInitialRoute() async {
    final state = await RouteStateManager.load();
    if (state == null) return '/home';
    
    // 恢复到上次位置
    switch (state.page) {
      case 'trades':
        return '/trades/${state.tradesPanel}';
      case 'funds':
        return '/funds/${state.fundsPanel}';
      case 'markets':
        return '/markets';
      default:
        return '/home';
    }
  }
  
  static final router = GoRouter(
    debugLogDiagnostics: true,
    initialLocation: '/home', // 会在 main 中动态设置
    routes: [
      // 主页面
      GoRoute(
        path: '/home',
        name: 'home',
        pageBuilder: (context, state) => NoTransitionPage(
          child: HomePage(),
        ),
      ),
      
      // Markets 页面
      GoRoute(
        path: '/markets',
        name: 'markets',
        pageBuilder: (context, state) => NoTransitionPage(
          child: MarketsPage(),
        ),
      ),
      
      // Trades 页面（带面板参数）
      GoRoute(
        path: '/trades/:panel',
        name: 'trades',
        pageBuilder: (context, state) {
          final panel = state.pathParameters['panel'] ?? 'capital';
          return NoTransitionPage(
            child: TradesPage(initialPanel: panel),
          );
        },
        routes: [
          // Trades 子页面（例如：交易详情）
          GoRoute(
            path: 'detail/:orderId',
            builder: (context, state) {
              final orderId = state.pathParameters['orderId']!;
              return TradeDetailPage(orderId: orderId);
            },
          ),
        ],
      ),
      
      // Funds 页面（带面板参数）
      GoRoute(
        path: '/funds/:panel',
        name: 'funds',
        pageBuilder: (context, state) {
          final panel = state.pathParameters['panel'] ?? 'capital';
          return NoTransitionPage(
            child: FundsPage(initialPanel: panel),
          );
        },
        routes: [
          // Funds 子页面
          GoRoute(
            path: 'deposit',
            builder: (context, state) => DepositPage(),
          ),
          GoRoute(
            path: 'withdrawal',
            builder: (context, state) => WithdrawalPage(),
          ),
          GoRoute(
            path: 'loan',
            builder: (context, state) => LoanPage(),
          ),
          GoRoute(
            path: 'repayment',
            builder: (context, state) => RepaymentPage(),
          ),
          GoRoute(
            path: 'transfer',
            builder: (context, state) => TransferPage(),
          ),
        ],
      ),
    ],
    
    // 错误处理
    errorBuilder: (context, state) => Scaffold(
      body: Center(
        child: Text('Page not found: ${state.uri}'),
      ),
    ),
  );
}

// 无动画页面切换（类似 Web 的即时切换）
class NoTransitionPage extends CustomTransitionPage {
  NoTransitionPage({required Widget child})
      : super(
          child: child,
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            return child;
          },
        );
}
```

### 5. API 仓储层

```dart
// lib/repositories/trade_repository.dart
import 'package:dio/dio.dart';
import '../models/trade_data.dart';
import '../services/api_client.dart';

class TradeRepository {
  final ApiClient _api;
  
  TradeRepository(this._api);
  
  // I00009 接口：获取持仓和余额
  Future<TradeData> fetchTradeData({
    required String userAccount,
    required int detailsWalletType, // 0=Capital, 1=Leveraged
    required String symbol,
  }) async {
    // 参数校验
    if (userAccount.trim().isEmpty) {
      throw ArgumentError('userAccount 不能为空');
    }
    if (symbol.trim().isEmpty) {
      throw ArgumentError('symbol 不能为空');
    }
    
    print('[TradeRepo] 调用 I00009: '
        'userAccount=$userAccount, '
        'detailsWalletType=$detailsWalletType, '
        'symbol=$symbol');
    
    try {
      final response = await _api.post(
        '/I00009',
        data: {
          'userAccount': userAccount,
          'detailsWalletType': detailsWalletType,
          'itemId': symbol,
        },
      );
      
      if (response.data['code'] != 2000) {
        throw ApiException(
          response.data['message'] ?? 'Unknown error',
          code: response.data['code'],
        );
      }
      
      return TradeData.fromJson(response.data['data']);
    } on DioException catch (e) {
      print('[TradeRepo] I00009 失败: $e');
      rethrow;
    }
  }
}

// lib/repositories/funds_repository.dart
class FundsRepository {
  final ApiClient _api;
  
  FundsRepository(this._api);
  
  // I00003 接口：获取资金概览
  Future<FundsData> fetchFundsOverview({
    required String userAccount,
    required int detailsWalletType, // 0=Capital, 1=Leveraged
  }) async {
    if (userAccount.trim().isEmpty) {
      throw ArgumentError('userAccount 不能为空');
    }
    
    print('[FundsRepo] 调用 I00003: '
        'userAccount=$userAccount, '
        'detailsWalletType=$detailsWalletType');
    
    try {
      final response = await _api.post(
        '/I00003',
        data: {
          'userAccount': userAccount,
          'detailsWalletType': detailsWalletType,
        },
      );
      
      if (response.data['code'] != 2000) {
        throw ApiException(
          response.data['message'] ?? 'Unknown error',
          code: response.data['code'],
        );
      }
      
      return FundsData.fromJson(response.data['data']);
    } on DioException catch (e) {
      print('[FundsRepo] I00003 失败: $e');
      rethrow;
    }
  }
}
```

### 6. Trades 页面实现

```dart
// lib/pages/trades_page.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/route_provider.dart';
import '../providers/trade_provider.dart';

class TradesPage extends ConsumerStatefulWidget {
  final String initialPanel;
  
  const TradesPage({
    Key? key,
    required this.initialPanel,
  }) : super(key: key);
  
  @override
  ConsumerState<TradesPage> createState() => _TradesPageState();
}

class _TradesPageState extends ConsumerState<TradesPage> {
  late String _currentPanel;
  
  @override
  void initState() {
    super.initState();
    _currentPanel = widget.initialPanel;
    
    // 页面加载后调用接口
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadTradeData();
    });
  }
  
  // 加载交易数据
  Future<void> _loadTradeData() async {
    final userAccount = ref.read(userAccountProvider);
    final symbol = ref.read(activeSymbolProvider);
    
    if (userAccount.isEmpty) {
      print('[TradesPage] userAccount 为空，跳过接口调用');
      return;
    }
    
    final detailsWalletType = _currentPanel == 'leveraged' ? 1 : 0;
    
    await ref.read(tradeDataProvider.notifier).fetchData(
      userAccount: userAccount,
      detailsWalletType: detailsWalletType,
      symbol: symbol,
    );
  }
  
  // 切换面板
  void _switchPanel(String panel) {
    if (panel == _currentPanel) return;
    
    setState(() {
      _currentPanel = panel;
    });
    
    // 保存到路由状态
    ref.read(routeStateProvider.notifier).changeTradesPanel(panel);
    
    // 重新加载数据
    _loadTradeData();
  }
  
  @override
  Widget build(BuildContext context) {
    final tradeData = ref.watch(tradeDataProvider);
    
    return Scaffold(
      appBar: AppBar(
        title: const Text('Trades'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(48),
          child: Row(
            children: [
              _buildTabButton('Capital', 'capital'),
              _buildTabButton('Leveraged', 'leveraged'),
            ],
          ),
        ),
      ),
      body: tradeData.when(
        data: (data) => _buildContent(data),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) => Center(child: Text('Error: $error')),
      ),
    );
  }
  
  Widget _buildTabButton(String label, String panel) {
    final isActive = _currentPanel == panel;
    
    return Expanded(
      child: GestureDetector(
        onTap: () => _switchPanel(panel),
        child: Container(
          height: 48,
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: isActive ? Colors.blue : Colors.transparent,
                width: 2,
              ),
            ),
          ),
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 16,
                fontWeight: isActive ? FontWeight.bold : FontWeight.normal,
                color: isActive ? Colors.blue : Colors.grey,
              ),
            ),
          ),
        ),
      ),
    );
  }
  
  Widget _buildContent(TradeData data) {
    return PageView(
      children: [
        if (_currentPanel == 'capital')
          _buildCapitalPanel(data)
        else
          _buildLeveragedPanel(data),
      ],
    );
  }
  
  Widget _buildCapitalPanel(TradeData data) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Balance: ${data.balance}'),
          Text('Position: ${data.position}'),
          // ... 更多内容
        ],
      ),
    );
  }
  
  Widget _buildLeveragedPanel(TradeData data) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Leveraged Balance: ${data.balance}'),
          Text('Leverage: ${data.leverage}x'),
          // ... 更多内容
        ],
      ),
    );
  }
}
```

### 7. 主应用入口

```dart
// lib/main.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'router/app_router.dart';
import 'services/route_state_manager.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // 恢复路由状态
  final initialRoute = await AppRouter.getInitialRoute();
  
  runApp(
    ProviderScope(
      child: MyApp(initialRoute: initialRoute),
    ),
  );
}

class MyApp extends StatelessWidget {
  final String initialRoute;
  
  const MyApp({
    Key? key,
    required this.initialRoute,
  }) : super(key: key);
  
  @override
  Widget build(BuildContext context) {
    // 动态设置初始路由
    AppRouter.router.go(initialRoute);
    
    return MaterialApp.router(
      title: 'ICE Markets',
      theme: ThemeData(
        primarySwatch: Colors.blue,
        useMaterial3: true,
      ),
      routerConfig: AppRouter.router,
    );
  }
}
```

## 关键差异点

### 1. 页面切换方式

**Web（CSS Transform）**：
```javascript
wrapper.style.transform = `translateX(-${idx * 25}%)`;
```

**Flutter（PageView）**：
```dart
PageView(
  controller: _pageController,
  children: [HomePage(), MarketsPage(), TradesPage(), FundsPage()],
);
_pageController.jumpToPage(index); // 无动画
_pageController.animateToPage(index); // 有动画
```

### 2. 状态持久化

**Web（sessionStorage）**：
- 标签页关闭后自动清除
- 同步操作

**Flutter（SharedPreferences）**：
- 应用关闭后仍保留（需要手动设置 TTL）
- 异步操作

### 3. 生命周期管理

**Web**：
```javascript
onLoad() {
  // 页面加载时执行
  setTimeout(() => {
    this.restoreRouteState();
  }, 100);
}
```

**Flutter**：
```dart
@override
void initState() {
  super.initState();
  WidgetsBinding.instance.addPostFrameCallback((_) {
    // UI 渲染完成后执行
    _restoreRouteState();
  });
}
```

## 依赖包清单

```yaml
# pubspec.yaml
dependencies:
  flutter:
    sdk: flutter
  
  # 状态管理
  flutter_riverpod: ^2.4.0  # 或 provider, bloc
  
  # 路由管理
  go_router: ^12.0.0
  
  # 持久化存储
  shared_preferences: ^2.2.0  # 轻量级
  hive: ^2.2.3                # 高性能
  
  # API 请求
  dio: ^5.3.0
  
  # JSON 序列化
  freezed_annotation: ^2.4.1
  json_annotation: ^4.8.1

dev_dependencies:
  # 代码生成
  build_runner: ^2.4.0
  freezed: ^2.4.1
  json_serializable: ^6.7.0
```

## 性能优化建议

### 1. 路由状态缓存

```dart
class RouteStateManager {
  static RouteState? _cache;
  static DateTime? _cacheTime;
  static const _cacheDuration = Duration(seconds: 5);
  
  static Future<RouteState?> load() async {
    // 5 秒内直接返回缓存
    if (_cache != null && _cacheTime != null) {
      if (DateTime.now().difference(_cacheTime!) < _cacheDuration) {
        return _cache;
      }
    }
    
    // 从 SharedPreferences 读取
    final state = await _loadFromStorage();
    _cache = state;
    _cacheTime = DateTime.now();
    return state;
  }
}
```

### 2. API 请求去重

```dart
class TradeRepository {
  final Map<String, Future<TradeData>> _pending = {};
  
  Future<TradeData> fetchTradeData({
    required String userAccount,
    required int detailsWalletType,
    required String symbol,
  }) async {
    final key = '$userAccount-$detailsWalletType-$symbol';
    
    // 如果正在请求，返回同一个 Future
    if (_pending.containsKey(key)) {
      return _pending[key]!;
    }
    
    final future = _doFetch(userAccount, detailsWalletType, symbol);
    _pending[key] = future;
    
    try {
      final result = await future;
      return result;
    } finally {
      _pending.remove(key);
    }
  }
}
```

### 3. 懒加载页面

```dart
class MainPage extends StatefulWidget {
  @override
  State<MainPage> createState() => _MainPageState();
}

class _MainPageState extends State<MainPage> {
  final Map<int, Widget> _cachedPages = {};
  
  Widget _getPage(int index) {
    if (_cachedPages.containsKey(index)) {
      return _cachedPages[index]!;
    }
    
    Widget page;
    switch (index) {
      case 0: page = HomePage(); break;
      case 1: page = MarketsPage(); break;
      case 2: page = TradesPage(); break;
      case 3: page = FundsPage(); break;
      default: page = HomePage();
    }
    
    _cachedPages[index] = page;
    return page;
  }
}
```

## 测试示例

```dart
// test/route_state_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../lib/services/route_state_manager.dart';
import '../lib/models/route_state.dart';

void main() {
  setUp(() async {
    // 清除所有缓存
    SharedPreferences.setMockInitialValues({});
  });
  
  test('保存和加载路由状态', () async {
    final state = RouteState(
      page: 'funds',
      fundsPanel: 'leveraged',
    );
    
    await RouteStateManager.save(state);
    final loaded = await RouteStateManager.load();
    
    expect(loaded?.page, 'funds');
    expect(loaded?.fundsPanel, 'leveraged');
  });
  
  test('过期状态自动清除', () async {
    // 模拟 25 小时前的状态
    final oldTimestamp = DateTime.now()
        .subtract(Duration(hours: 25))
        .millisecondsSinceEpoch;
    
    SharedPreferences.setMockInitialValues({
      'webapp_route_state_v1': '{"page":"trades","timestamp":$oldTimestamp}'
    });
    
    final loaded = await RouteStateManager.load();
    expect(loaded, isNull);
  });
}
```

## 总结

**完全可以迁移！** 核心概念都是通用的：

1. ✅ **状态管理**：`setData` → Provider/Riverpod/Bloc
2. ✅ **路由管理**：手动切换 → GoRouter
3. ✅ **持久化存储**：sessionStorage → SharedPreferences
4. ✅ **API 调用**：superAPI → Dio + Repository
5. ✅ **生命周期**：onLoad → initState + addPostFrameCallback

建议使用：
- **Riverpod** 做状态管理（更现代、更强大）
- **GoRouter** 做路由管理（声明式、支持深层链接）
- **Freezed** 做数据模型（不可变、类型安全）
- **Dio** 做 HTTP 请求（功能丰富、拦截器支持）

这样迁移过去的架构会更加健壮和可维护！
