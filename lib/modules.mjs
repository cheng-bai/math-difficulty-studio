export const modules=[
 {name:'结构化内容阅读',status:'已实现',description:'原创示例、Markdown/LaTeX、题目解析、六维证据、难度图表、风险依据与同版本下载。',href:'/national/试卷总览.html'},
 {name:'确定性评分与版本管理',status:'已实现',description:'Schema校验、固定算法版本、变更预览、请求幂等、版本冲突保护、原子发布与回退。'},
 {name:'本地OCR',status:'可选配置',description:'本机任务持久化、不可变原件、失败重试及Markdown/题图整包。MinerU需独立安装；远端识别逐文件征求同意。',href:'/workbench'},
 {name:'账号与受控阅读',status:'已实现',description:'本地回环模式、legacy受邀账号与可选Supabase授权。云端不会开启本地免登录/OCR模式。',href:'/login'},
 {name:'题目检索',status:'已实现',description:'检索结构化小问、知识模块、评分状态与解题方法。',href:'/search'},
 {name:'自动解题与数学审核',status:'待接入',description:'当前维护者提供数学证据，程序负责验证与复算；没有宣称可自动证明或审定数学结论。'},
 {name:'独立远程内容发布',status:'待接入',description:'当前内容快照随应用部署；文件仓库使用Unix锁，尚无多实例共享数据库与远程写入API。'}
];
