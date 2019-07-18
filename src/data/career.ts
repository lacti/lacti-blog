interface Career {
  company: string;
  job: string;
  begin: Date;
  end: Date;
  work: CareerWork[];
}

interface CareerWork {
  title: string;
  description: string;
  skills: string[];
}

/* eslint-disable max-len */
const careers: Career[] = [
  {
    company: "VoyagerX",
    job: "프로그래머",
    begin: new Date(2018, 3, 5),
    end: new Date(2019, 5, 30),
    work: [
      {
        title: "고성능 웹 데이터 크롤러 개발",
        description: `
        학습을 위해 대량으로 텍스트 데이터를 수집할 일이 있었고 이를 위해 한국어, 일본어, 영어에 대해 Robots rule을 지키면서 In-house 서버 2~3대에서 1주일에 1TB의 tag-stripped 텍스트를 수집하는 시스템을 개발.
        처음엔 Python+RabbitMQ+MySQL로 개발하였으나 asyncio와 uvcore 성능이 별로 좋지 않고 DB 성능 저하로 400MB~1GB/hr의 수집을 했지만 데이터의 특성상 append only이므로 NodeJS+Redis+rawfile로 시스템을 전환한 후 더 적은 agent를 사용해도 10GB/hr 수준으로 데이터를 수집할 수 있었음.
        수집 현황을 확인하기 위해 Docker로 작성된 각 agent에서 Metric mediator를 거쳐 Prometheus로 지표를 수집하고, Grafana로 dashboard를 구축.
        `,
        skills: [
          "RabbitMQ",
          "Redis",
          "Python",
          "TypeScript",
          "Prometheus",
          "Grafana"
        ]
      },
      {
        title: "Transcript 기반의 영상 편집기 개발 (VREW)",
        description: `
        영상의 음성에서 Google Speech-to-text API를 사용하여 Transcript 추출하여 Timeline 대신 축으로 사용하여 영상을 편집할 수 있는 도구(VREW)의 Client 개발환경(React+Redux+TypeScript+Electron)을 구축하고 기초 설계를 수행.
        Client로부터 전달된 음성을 AWS S3와 Lambda의 연계를 통해 원하는 데이터가 추출될 수 있는 Backend의 기반과 개발환경(NodeJS+TypeScript+Serverless+AWS)을 구축하고 설계 및 관리.
        Backend에서 발생하는 access log와 application log를 수집하여 In-house Elasticsearch로 전달해 Kibana로
        `,
        skills: [
          "NodeJS",
          "TypeScript",
          "AWS",
          "Serverless",
          "CDN",
          "Google Speech-to-text API",
          "Elasticsearch",
          "Kibana",
          "Jenkins",
          "React",
          "Redux",
          "Electron",
          "ffmpeg"
        ]
      }
    ]
  }
];

export default careers;
