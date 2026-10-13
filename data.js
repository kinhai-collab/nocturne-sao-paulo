window.RESTAURANTS = [
['evvai','Evvai',3,'Modern Cuisine','$$$$','Brazilian and Italian roots, expressed through the Oriundi tasting menu.','https://evvai.meitre.com/','Book externally','https://www.evvai.com.br/'],
['tuju','Tuju',3,'Creative','$$$$','Seasonal Brazilian ingredients and a menu inspired by the rhythms of nature.','https://www.exploretock.com/tuju-so-paulo','Book externally','https://www.tuju.com.br/'],
['d-o-m','D.O.M.',2,'Creative','$$$$','Alex Atala’s exploration of native Brazilian ingredients.','https://domrestaurante.com.br/reservas/','Book externally','https://domrestaurante.com.br/'],
['fame-osteria','Fame Osteria',1,'Italian Contemporary','$$$$','Contemporary Italian cooking in an intimate dining setting.','','Contact details',''],
['jun-sakamoto','Jun Sakamoto',1,'Japanese','$$$$','A sushi experience built around carefully prepared nigiri.','https://www.junsakamoto.com.br/','Book externally','https://www.junsakamoto.com.br/'],
['kan-suke','Kan Suke',1,'Japanese','$$$','A small counter devoted to precise sushi and sashimi.','','Contact details',''],
['kanoe','KANOE',1,'Japanese','$$$$','Traditional Japanese techniques and a carefully paced omakase.','https://kanoerestaurant.com/','Booking on official site','https://kanoerestaurant.com/'],
['kazuo','Kazuo',1,'Asian Influences','$$$','A personal tasting journey through a broad palette of Asian flavors.','','Official website','https://kazuorestaurante.com.br/'],
['kinoshita','Kinoshita',1,'Japanese','$$$$','Kappo cooking that balances tradition, technique and delicate seafood.','https://reservation-widget.tagme.com.br/reservation/schedule/56c777610896b3cd13c60497/reservationWidget','Book externally','https://restaurantekinoshita.com.br/'],
['kuro','Kuro',1,'Japanese','$$$','An intimate omakase counter with traditional and contemporary influences.','https://kuroeshiro.com.br/reservas/','Booking information','https://kuroeshiro.com.br/'],
['mani','Maní',1,'Creative','$$$','Contemporary Brazilian cooking from Helena Rizzo and Willem Vandeven.','https://usetag.me/grupomani','Book externally','https://www.restaurantemani.com.br/'],
['murakami','Murakami',1,'Japanese Contemporary','$$$$','Expressive Japanese cooking from chef Tsuyoshi Murakami.','https://www.murakamimu.com/','Booking on official site','https://www.murakamimu.com/'],
['oizumi-sushi','Oizumi Sushi',1,'Japanese','$$$','An omakase focused on fish maturation and depth of flavor.','https://oizumisushi.com/','Booking on official site','https://oizumisushi.com/'],
['picchi','Picchi',1,'Italian','$$$$','Italian foundations, fresh pasta and a contemporary point of view.','','Official website','https://restaurantepicchi.com.br/'],
['ryo-gastronomia','Ryo Gastronomia',1,'Japanese','$$$$','Traditional Japanese kaiseki with seasonal ingredients.','https://ryo.meitre.com/','Book externally','https://www.ryogastronomia.com.br/'],
['tangara-jean-georges','Tangará Jean-Georges',1,'Contemporary','$$$$','Contemporary dining within the green surroundings of Palácio Tangará.','','Official hotel website','https://www.oetkerhotels.com/hotels/palacio-tangara/']
].map(([id,name,stars,cuisine,price,description,booking,bookingLabel,website])=>({id,name,stars,cuisine,price,description,booking,bookingLabel,website,guide:'https://guide.michelin.com/en/sao-paulo-region/sao-paulo/restaurant/'+id}));

window.DINING_BUDGET = {"usd": 125, "brlPerUsd": 4.9873, "checked": "12 Oct 2026", "fxSource": "https://www.remessaonline.com.br/cotacao/cotacao-dolar"};
window.MENU_PRICES = {
  "evvai": {
    "brl": null,
    "label": "Oriundi tasting menu",
    "source": "https://www.evvai.com.br/cardapio",
    "status": "Official menu",
    "notes": "Current regular-menu price could not be confirmed. April reporting lists R$1,250, while R$1,650 reporting refers to June 12 only; neither is treated as a current quote.",
    "options": []
  },
  "tuju": {
    "brl": 1650,
    "label": "10-course tasting",
    "source": "https://www.exploretock.com/tuju-so-paulo",
    "status": "Official menu",
    "notes": "Drinks and service excluded. Booking page also lists a non-deductible platform fee. The reservation payment is a deposit, not the menu price.",
    "options": []
  },
  "d-o-m": {
    "brl": 1150,
    "label": "10-course tasting",
    "source": "https://www.seudinheiro.com/2026/lifestyle/dia-dos-namorados-quanto-custa-comer-em-um-restaurante-com-estrela-michelin-no-brasil-sama/",
    "status": "Reported Jun 2026",
    "notes": "Regular menu reported June 12, 2026; confirm the current price before booking. Wine pairing excluded.",
    "options": []
  },
  "fame-osteria": {
    "brl": 760,
    "label": "11-course tasting",
    "source": "https://www1.folha.uol.com.br/o-melhor-de-sao-paulo/2026/restaurantes-bares-e-cozinha/2026/08/italia-se-manifesta-de-forma-viva-e-moderna-no-fame-vencedor-do-melhor-de-sao-paulo-pela-primeira-vez.shtml",
    "status": "Reported Aug 2026",
    "notes": "Reported on August 17, 2026; confirm current price and service.",
    "options": []
  },
  "jun-sakamoto": {
    "brl": 650,
    "label": "Table omakase",
    "source": "https://www.junsakamoto.com.br/",
    "status": "Official booking page",
    "notes": "The table experience is the reference. The official page also lists the Jun counter experience at R$850. Confirm service and drinks.",
    "options": [
      {
        "label": "Jun counter omakase",
        "brl": 850
      }
    ]
  },
  "kan-suke": {
    "brl": 520,
    "label": "Cold tasting menu",
    "source": "https://www.seudinheiro.com/2026/lifestyle/dia-dos-namorados-quanto-custa-comer-em-um-restaurante-com-estrela-michelin-no-brasil-sama/",
    "status": "Reported Jun 2026",
    "notes": "Regular menus reported June 12, 2026. Confirm current prices and service.",
    "options": [
      {
        "label": "Tasting with hot dishes",
        "brl": 550
      }
    ]
  },
  "kanoe": {
    "brl": null,
    "label": "Omakase",
    "source": "https://kanoerestaurant.com/omakase/",
    "status": "Official menu",
    "notes": "Current regular-menu price could not be confirmed. The June 12 special menu at R$1,800 is not used as a regular dinner quote.",
    "options": []
  },
  "kazuo": {
    "brl": 590,
    "label": "Surprise Yourself tasting",
    "source": "https://www.seudinheiro.com/2026/lifestyle/dia-dos-namorados-quanto-custa-comer-em-um-restaurante-com-estrela-michelin-no-brasil-sama/",
    "status": "Reported Jun 2026",
    "notes": "Regular menus reported June 12, 2026; confirm current prices, service and drinks.",
    "options": [
      {
        "label": "Itamae counter omakase",
        "brl": 690
      }
    ]
  },
  "kinoshita": {
    "brl": 748.81,
    "label": "8-course omakase",
    "source": "https://livemenu.app/menu/56c777610896b3cd13c60497",
    "status": "Official live menu",
    "notes": "Dinner reference is the 8-course omakase. Lower-cost lunch menus are excluded from the dinner comparison. Confirm service and drinks.",
    "options": []
  },
  "kuro": {
    "brl": 650,
    "label": "Omakase",
    "source": "https://kuroeshiro.com.br/reservas/",
    "status": "Official menu",
    "notes": "Published price is seasonal. Add 13% service: R$734.50 before drinks; approximately US$147.27, or US$22.27 above budget including service.",
    "options": []
  },
  "mani": {
    "brl": 370,
    "label": "3-course regular menu",
    "source": "https://www.restaurantemani.com.br/tasting-menu/",
    "status": "Official menu",
    "notes": "This is the shorter regular menu, not the full tasting experience. Full tasting must be chosen by everyone at the table. Confirm service and drinks.",
    "options": [
      {
        "label": "Full chef tasting",
        "brl": 780
      },
      {
        "label": "3-course vegetarian",
        "brl": 290
      }
    ]
  },
  "murakami": {
    "brl": 780,
    "label": "Murakami Experience",
    "source": "https://www.seudinheiro.com/2026/lifestyle/dia-dos-namorados-quanto-custa-comer-em-um-restaurante-com-estrela-michelin-no-brasil-sama/",
    "status": "Reported Jun 2026",
    "notes": "Regular menus reported June 12, 2026; confirm current prices and service.",
    "options": [
      {
        "label": "Sushi Experience",
        "brl": 1080
      }
    ]
  },
  "oizumi-sushi": {
    "brl": 750,
    "label": "Dinner omakase",
    "source": "https://www.exploretock.com/oizumi-sushi/",
    "status": "Official booking page",
    "notes": "Dinner is R$750 for counter or table; lunch is R$600 and is not the dinner comparison. Confirm service and drinks.",
    "options": []
  },
  "picchi": {
    "brl": 499,
    "label": "Tutto Pasta menu",
    "source": "https://restaurantepicchi.com.br/wp/wp-content/uploads/2026/10/CARDAPIO_SETEMBRO_2026.pdf",
    "status": "Official Sep 2026 menu",
    "notes": "Pasta-only tasting is the reference. All guests at the table must choose the tasting menu. Service, drinks and any couvert are not included in this comparison.",
    "options": [
      {
        "label": "Tradizione tasting",
        "brl": 699
      },
      {
        "label": "Full Picchi tasting",
        "brl": 1249
      }
    ]
  },
  "ryo-gastronomia": {
    "brl": 1200,
    "label": "Chef tasting",
    "source": "https://www.seudinheiro.com/2026/lifestyle/dia-dos-namorados-quanto-custa-comer-em-um-restaurante-com-estrela-michelin-no-brasil-sama/",
    "status": "Reported Jun 2026",
    "notes": "Regular menu reported June 12, 2026; confirm current price and service. Wine pairing excluded.",
    "options": []
  },
  "tangara-jean-georges": {
    "brl": 850,
    "label": "Signature six-course menu",
    "source": "https://experienciaspalaciotangara.com.br/products/menu-signature-tangara-jeangeorges",
    "status": "Official experience listing",
    "notes": "Published voucher price; the listing currently shows sold out. Confirm regular dinner availability, service and price directly. Wine pairing is extra.",
    "options": []
  }
};
